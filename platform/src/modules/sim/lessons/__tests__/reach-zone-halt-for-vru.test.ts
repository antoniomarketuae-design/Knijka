/**
 * «СПРИ ПРЕД ЧОВЕКА» — `ReachZoneParams.requireHaltForVru`, the eighth witness
 * demand, and the pin `objectives.ts` names in its docblock.
 *
 * THE FRAME, and it is one beat of one drive rather than a summary.
 * `.audit-frames/w13/frames/sc-hz-emergency-stop__mobile-right`:
 *
 *   04-t064s   «Задача 2/3 Спри преди детето — с пълна спирачка, в лентата»
 *   04-t070s   «−10 изпитни т. +2  Удар в пешеходец»   ← a fresh violation card
 *              «✓ Спри преди детето — с пълна спирачка, в лентата»
 *
 * and the sheet closes «Задачи от маршрута ✓ Спри преди детето … 1:27» directly
 * over «Грешки (2)» whose first row is that strike. `sc-hzes-stop` is a halt
 * disc four metres short of the child's line, so coming to rest near the mark
 * was the whole certificate — nothing asked whether she was still standing.
 *
 * WHY IT IS A SECOND KEY AND NOT A WIDER `requireVruUntouched`. That matcher's
 * census, its eleven-title teeth and its «„Спри преди детето" does NOT match»
 * row are all pinned next door in `reach-zone-vru-untouched.test.ts`, against
 * the ONE gate whose drills depend on it. Widening it in place would rewrite a
 * shipped census to close a different row. Two keys, two matchers, two teeth
 * tests, one context fact.
 *
 * AND THE ARGUMENT THAT KEPT THE TITLE OUT IS ANSWERED, not ignored: „the car
 * DID stop before her; the strike came on the move-off" is a fact about ONE
 * recorded drive, and the frames above show the opposite ordering on another.
 * A per-frame demand answers both correctly, which §4 asserts in both
 * directions off one tick stream.
 *
 * BOTH DIRECTIONS, and the mutation that turns them red: drop the
 * `haltForVruOk` conjunct from `done` in `stepReachZone` (or the `else if`
 * that derives the demand) and every „REFUSED" row below goes green.
 */

import { describe, expect, it } from "vitest";
import type { LessonObjective, LessonSpec } from "../../contracts";
import type { SimTick } from "../../rules";
import { applyTick, createLessonSession } from "../engine";
import {
  deriveHaltForVruDemand,
  parseObjectiveParams,
  type WitnessedReachZoneParams,
} from "../objectives";
import { compileScenario } from "../scenario/compile";
import { SCENARIO_TEMPLATES } from "../scenario/templates";
import type { LessonSessionState } from "../types";
import { makeTick } from "./fixtures";

function parsed(titleBg: string, params: Record<string, unknown>): WitnessedReachZoneParams {
  const objective: LessonObjective = { id: "o1", titleBg, kind: "reachZone", params };
  return parseObjectiveParams(objective) as WitnessedReachZoneParams;
}

// ---------------------------------------------------------------------------
// 1 · The matcher, both directions — the instrument before the measurement
// ---------------------------------------------------------------------------

describe("the banner's own words decide the demand — «спри пред/преди» + a person", () => {
  it("matches the three shipped claims", () => {
    expect(deriveHaltForVruDemand("Спри преди детето — с пълна спирачка, в лентата")).toBe(true);
    expect(deriveHaltForVruDemand("Спри пред пътеката за появилия се пешеходец")).toBe(true);
    expect(deriveHaltForVruDemand("Спри пред тротоара и пропусни пешеходеца")).toBe(true);
  });

  it("matches none of the halts that stop for a PLACE", () => {
    // Each of these is a shipped objective title. A demand about a person's
    // fate on a gate that never mentions one is a certificate withheld for
    // something it never claimed — the false refusal this whole demand set is
    // written against.
    for (const t of [
      "Спри напълно на стоп-линията преди релсите",
      "Спри пред релсите, докато отсрещната страна е заета",
      "Спри на разрешеното място далеч след прелеза",
      "Спри плътно вдясно в аварийната лента",
      "Спри точно на позицията зад авариралия",
      "Спри и изчакай на разширението (под 6 км/ч)",
      "Спри напълно на стоп-линията на знак Б2",
    ]) {
      expect(deriveHaltForVruDemand(t), t).toBe(false);
    }
  });

  it("does not swallow the «изчакай» family that belongs to the fourth demand", () => {
    expect(deriveHaltForVruDemand("Изчакай детето и продължи до края на отсечката")).toBe(false);
  });

  it("the rule engine's own fault titles can never author a demand", () => {
    // They are never passed to this matcher (it sees `objective.titleBg` only),
    // and the word-boundary guard on «спри» keeps «Спиране …» out regardless —
    // the instrument bug this programme has shipped four times.
    expect(deriveHaltForVruDemand("Спиране върху релсите")).toBe(false);
    expect(deriveHaltForVruDemand("Удар в детето")).toBe(false);
    expect(deriveHaltForVruDemand("Непропускане на пешеходец")).toBe(false);
  });

  it("«Остани зад детето» stays out — recorded, not overlooked", () => {
    // A claim about relative POSITION behind a moving rider, not a halt. It is
    // excluded because no frame has asked for it, and this file adds demands a
    // measured drive requires. The row is written down so the next census
    // starts from the answer instead of re-deriving it.
    expect(deriveHaltForVruDemand("Остани зад детето, докато лъкатуши")).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// 2 · The census — over the whole catalogue, through the real parser
// ---------------------------------------------------------------------------

describe("the catalogue census", () => {
  it("binds exactly the three halt-for-a-person gates", () => {
    const bound: string[] = [];
    for (const spec of SCENARIO_TEMPLATES) {
      for (const o of spec.success) {
        const p = o.params as { kind?: string };
        if (p.kind !== "reachZone") continue;
        const out = parseObjectiveParams({
          id: o.id,
          titleBg: o.titleBg,
          kind: "reachZone",
          params: o.params as unknown as Record<string, unknown>,
        }) as WitnessedReachZoneParams;
        if (out.requireHaltForVru === true) bound.push(`${spec.id}/${o.id}`);
      }
    }
    // By name. An over-wide matcher shows up here as a fourth entry; a dead one
    // shows up as an empty list.
    expect(bound.sort()).toEqual([
      "sc-hz-emergency-stop/sc-hzes-stop",
      "sc-merge-from-property/sc-mfp-walk-yield",
      "sc-pe-night-unlit/sc-pnu-halt",
    ]);
  });

  it("SURVIVES THE COMPILE, which is the whole dead-predicate guard", () => {
    // `scenario/params.ts compileObjectiveParams` is a WHITELIST: every term it
    // does not name by hand is dropped between the authored template and the
    // compiled LessonSpec a student actually plays. An AUTHORED key would die
    // there silently (that file's own comment carries the measurement for
    // `requireRailClear`); a title-derived one cannot, because `titleBg` is the
    // banner and the banner is rendered. This asserts that, at every rung.
    for (const level of [1, 2, 3, 4, 5] as const) {
      const lesson = compileScenario(
        SCENARIO_TEMPLATES.find((s) => s.id === "sc-hz-emergency-stop")!,
        level,
      );
      const gate = lesson.objectives.find((o) => o.id === "sc-hzes-stop")!;
      expect(
        (parseObjectiveParams(gate) as WitnessedReachZoneParams).requireHaltForVru,
        `L${level}`,
      ).toBe(true);
    }
  });
});

// ---------------------------------------------------------------------------
// 3 · The measurement, through `applyTick` — the entry point the shell calls
// ---------------------------------------------------------------------------

/**
 * ENGINE-LEVEL ON PURPOSE. The lesson of this whole programme is that a gate
 * nothing routes to is not a repair, so these drive `applyTick` — the function
 * `LessonPlayShell.tsx:3880` itself calls — rather than `stepObjective`.
 */
describe("a struck person refuses the halt certificate, and only where it is claimed", () => {
  const haltLesson = (titleBg: string): LessonSpec => ({
    id: "t-vru-halt",
    order: 99,
    titleBg: "Тест спиране пред човек",
    descriptionBg: "тест",
    conceptIds: [],
    spawn: { position: { x: 4.06, y: 120 }, headingDeg: 0 },
    preDrive: false,
    objectives: [
      { id: "t-halt", titleBg, kind: "reachZone", params: { x: 4.06, y: 146, radiusM: 4 } },
    ],
  });

  /** Roll up to the mark and come to rest on it — the halt the banner names. */
  function driveToHalt(): SimTick[] {
    const out: SimTick[] = [];
    let t = 0;
    for (let y = 120; y <= 146; y += 2) {
      out.push(makeTick({ t, speedKmh: 20, position: { x: 4.06, y } }));
      t += 1;
    }
    for (let i = 0; i < 4; i += 1) {
      out.push(makeTick({ t, speedKmh: 0, position: { x: 4.06, y: 146 } }));
      t += 1;
    }
    return out;
  }

  /** Drive it through the real engine, optionally striking a body on the first
   *  frame — before the disc, exactly as the w13 frame's order was. */
  function driveThroughEngine(
    lesson: LessonSpec,
    struck?: "pedestrian" | "cyclist" | "vehicle",
  ): LessonSessionState {
    let s = createLessonSession(lesson);
    let first = true;
    for (const frame of driveToHalt()) {
      const withStrike =
        first && struck !== undefined
          ? makeTick({ ...frame, events: [{ kind: "collision", withWhat: struck }] })
          : frame;
      first = false;
      s = applyTick(s, withStrike).state;
    }
    return s;
  }

  const CLAIM = "Спри преди детето — с пълна спирачка, в лентата";

  it("POSITIVE CONTROL: the clean drive still completes end-to-end", () => {
    // Without this the refusals below would only be asserting that a broken
    // harness never ticks anything.
    expect(driveThroughEngine(haltLesson(CLAIM)).objectives[0].status).toBe("done");
  });

  it("REFUSED: the child is struck — the w13 04-t070s frame", () => {
    const s = driveThroughEngine(haltLesson(CLAIM), "pedestrian");
    expect(s.objectives[0].status).toBe("active");
    // The strike really was graded, so the refusal rests on a fault the same
    // debrief prints with its copy, its corrective and чл. 48, ал. 3 — never on
    // a silent state (doc 64 THEO-4).
    expect(s.events.some((e) => e.kind === "violation" && e.code === "COLLISION")).toBe(true);
  });

  it("REFUSED: a cyclist counts — the same unarmoured body, чл. 42 / чл. 119", () => {
    expect(driveThroughEngine(haltLesson(CLAIM), "cyclist").objectives[0].status).toBe("active");
  });

  it("CREDITED: a struck VEHICLE says nothing about a halt made for a person", () => {
    // The demand may not become „any contact fails any halt gate": a car-to-car
    // impact is the rule engine's to grade and it is graded — but this banner
    // is a claim about a person.
    const s = driveThroughEngine(haltLesson(CLAIM), "vehicle");
    expect(s.objectives[0].status).toBe("done");
    expect(s.events.some((e) => e.kind === "violation" && e.code === "COLLISION")).toBe(true);
  });

  it("the demand does not leak: a place-halt gate ticks over the same strike", () => {
    const plain = haltLesson("Спри плътно вдясно в аварийната лента");
    expect(driveThroughEngine(plain, "pedestrian").objectives[0].status).toBe("done");
  });

  it("ONE REFUSAL, NEVER A TRAP: the refused drive still reaches its protocol", () => {
    // The trap `yieldFailedVoidsObjective` exists to prevent, checked here
    // rather than assumed: a student who struck the child must be able to reach
    // the −10 card that teaches him чл. 48, ал. 3 without quitting and
    // forfeiting the attempt's XP. The gate stays honestly `active`; only the
    // strand goes.
    //
    // The tail is FINISH_STUCK_S (12 s) of standstill plus margin, because the
    // rescue this asserts is dwell-based — a drive photographed over eighteen
    // ticks has not yet given it time to fire, which is a fact about the tick
    // stream and not about the product.
    let s = createLessonSession(haltLesson(CLAIM));
    let first = true;
    for (const frame of driveToHalt()) {
      const tick = first
        ? makeTick({ ...frame, events: [{ kind: "collision", withWhat: "pedestrian" }] })
        : frame;
      first = false;
      s = applyTick(s, tick).state;
    }
    for (let t = 40; t < 100 && s.phase === "driving"; t += 1) {
      s = applyTick(s, makeTick({ t, speedKmh: 0, position: { x: 4.06, y: 146 } })).state;
    }
    expect(s.objectives[0].status).toBe("active");
    expect(s.phase).not.toBe("driving");
  });
});

// ---------------------------------------------------------------------------
// 4 · Both orderings — the half the shipped census got wrong
// ---------------------------------------------------------------------------

describe("the strike's position in the run decides, and both orders are answered", () => {
  const lesson: LessonSpec = {
    id: "t-vru-halt-order",
    order: 99,
    titleBg: "Тест ред",
    descriptionBg: "тест",
    conceptIds: [],
    spawn: { position: { x: 4.06, y: 120 }, headingDeg: 0 },
    preDrive: false,
    objectives: [
      {
        id: "t-halt",
        titleBg: "Спри преди детето — с пълна спирачка, в лентата",
        kind: "reachZone",
        params: { x: 4.06, y: 146, radiusM: 4 },
      },
      {
        id: "t-finish",
        titleBg: "Продължи до края на отсечката",
        kind: "reachZone",
        params: { x: 4.06, y: 180, radiusM: 8 },
      },
    ],
  };

  /** y 120 → 190: halt at the mark, then move off to the finish disc. */
  function wholeRoute(): SimTick[] {
    const out: SimTick[] = [];
    let t = 0;
    for (let y = 120; y <= 146; y += 2) {
      out.push(makeTick({ t, speedKmh: 20, position: { x: 4.06, y } }));
      t += 1;
    }
    for (let i = 0; i < 3; i += 1) {
      out.push(makeTick({ t, speedKmh: 0, position: { x: 4.06, y: 146 } }));
      t += 1;
    }
    for (let y = 148; y <= 190; y += 2) {
      out.push(makeTick({ t, speedKmh: 20, position: { x: 4.06, y } }));
      t += 1;
    }
    return out;
  }

  function run(strikeAtT: number | null): LessonSessionState {
    let s = createLessonSession(lesson);
    for (const frame of wholeRoute()) {
      const tick =
        strikeAtT !== null && frame.t === strikeAtT
          ? makeTick({ ...frame, events: [{ kind: "collision", withWhat: "pedestrian" }] })
          : frame;
      s = applyTick(s, tick).state;
    }
    return s;
  }

  it("BEFORE the halt: the certificate is never issued", () => {
    // The w13 ordering. The whole point of the repair.
    expect(run(0).objectives[0].status).toBe("active");
  });

  it("AFTER the halt: the certificate stands — a completed objective is not re-stepped", () => {
    // The shipped census's own argument, kept true: „the car DID stop before
    // her; the strike came on the move-off". A student who performed the halt
    // and then clipped her pulling away has earned THAT tick, and the move-off
    // is the next objective's claim and the rule engine's −10.
    const s = run(20);
    expect(s.objectives[0].status).toBe("done");
    expect(s.events.some((e) => e.kind === "violation" && e.code === "COLLISION")).toBe(true);
  });

  it("CONTROL: with no strike at all both gates complete", () => {
    const s = run(null);
    expect(s.objectives.map((o) => o.status)).toEqual(["done", "done"]);
  });
});
