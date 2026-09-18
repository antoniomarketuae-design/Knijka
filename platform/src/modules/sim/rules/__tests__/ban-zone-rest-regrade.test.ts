import { readFileSync } from "node:fs";
import path, { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { codes, cruise, drive } from "./fixtures";
import {
  SCENARIO_TEMPLATES,
  applyTick,
  buildLessonResult,
  compileScenario,
  createLessonSession,
  type LessonSessionState,
  type LessonSpec,
} from "@/modules/sim/lessons";
import { createWorldRuntime } from "@/modules/sim/runtime/worldRuntime";
import type { VehicleSample } from "@/modules/sim/contracts";

/**
 * THE REST IN A FORBIDDEN ZONE THAT COST NOTHING — `BAN_ZONE_REST_REGRADE_SEC`
 * (audit `sc-pk-double-park:11ddd063`).
 *
 * WHAT WAS MEASURED, through `compileScenario → createWorldRuntime → applyTick
 * → buildLessonResult` on the row's own lesson and district, before the
 * re-grade existed: a car that stops in the lane beside the parked row at
 * y = 130 — inside the authored чл. 98 span [70, 210] of pk-double-v1 — and
 * never moves again reached its sheet on
 *   coachedMistakes  ILLEGAL_STOP_IN_BAN_ZONE ×1
 *   summary.mistakes (empty)           score 0 наказателни точки
 * Fifty seconds standing where престоят е забранен, on the lesson whose entire
 * subject is that act, priced at nothing: the code is основна, so the
 * teach-first coach gives the FIRST bill away as a free mini-lesson, and
 * `stepEpisode` bills once per rest and never asks again.
 *
 * §1 pins the reducer's two thresholds and every acquittal that must survive
 * them; §2 pins what the second bill does once it reaches a LESSON.
 *
 * WHAT ADR-009 CHANGED HERE, 2026-09-18 (founder Ruling A; ADR-009 in
 * docs/architecture/07, spec doc 92 §3.4b b and §8.3). §2 drives
 * `sc-pk-double-park@L1`, and the act it drives IS the act that lesson exists
 * to teach: the derived `lessonMistakeTargets` of that rung is exactly
 * `[ILLEGAL_STOP_IN_BAN_ZONE]` (measured on this tree — L1/L2/L3/L5 carry it,
 * L4 `examMode` carries no field at all). On a practice rung the ruling forbids
 * the points that re-bill was reaching for — «NO exam points are taken for that
 * first occurrence» — so the second bill is dropped by `lessons/engine.ts`'s
 * regrade guard and the sheet reads 0 т. instead of 3.
 *
 * SO §2 NO LONGER ENDS AT THE SHEET, AND THE CONSTANT IS STILL MEASURED THERE.
 * What replaced the charge is the stronger answer to `sc-pk-double-park:
 * 11ddd063` — «Не е взет», with the act named — and the charge itself is kept
 * under measurement by a STRIP CONTROL: the identical drive against a copy of
 * the compiled lesson with only `lessonMistakeTargets` removed, where the −3
 * comes back marked `regrade: true`, six accrued seconds after the card. That
 * pair is what keeps `BAN_ZONE_REST_REGRADE_SEC` gated end-to-end: if the
 * re-grade ever stopped firing, the control would red while the ADR-009 case
 * stayed green, and a pair that can only ever agree is not a measurement.
 *
 * §1 IS UNTOUCHED BY THE RULING, and that is structural rather than lucky: it
 * folds `rules/engine.ts` directly through `fixtures.drive`, and ADR-009 lives
 * one layer up in `lessons/engine.ts`. The reducer still bills twice.
 */

const CODE = "ILLEGAL_STOP_IN_BAN_ZONE";
/**
 * `rules/engine.ts BAN_ZONE_REST_REGRADE_SEC` — restated, not imported
 * (module-private, exactly as the sibling sweep161 files restate theirs). One
 * literal for both halves of this file: §1 measures the gap in the reducer, §2's
 * control measures the SAME gap after it has travelled through the lesson
 * engine to the изпитен лист, and two copies of the number could drift apart.
 */
const BAN_ZONE_REST_REGRADE_SEC = 6;
const WORLD = resolve(__dirname, "../../../../../..", "content", "world");

/** Rolling into the span, then standing still inside it from `t0`. */
const APPROACH = cruise(0, 3, { speedKmh: 30, noStopZone: true });
const REST = (t0: number, t1: number) => cruise(t0, t1, { speedKmh: 0, noStopZone: true });

describe("§1 — the reducer bills a held ban-zone rest twice, and only twice", () => {
  it("4 s of rest bills once (the free mini-lesson), 10 s bills the re-grade too", () => {
    const short = drive([...APPROACH, ...REST(4, 10)]);
    expect(codes(short.events).filter((c) => c === CODE)).toHaveLength(1);

    const held = drive([...APPROACH, ...REST(4, 20)]);
    const bills = held.events.filter((e) => e.code === CODE);
    expect(bills).toHaveLength(2);
    // The second is the SAME breach again, and says so — `lessons/engine.ts`
    // drops a `regrade` wherever the code has already been charged.
    expect(bills[0].kind === "violation" && bills[0].regrade).toBeFalsy();
    expect(bills[1].kind === "violation" && bills[1].regrade).toBe(true);
    // Strictly larger threshold ⇒ strictly later, and 4 + 6 = 10 s of rest.
    expect(bills[1].t - bills[0].t).toBeCloseTo(BAN_ZONE_REST_REGRADE_SEC, 5);
  });

  it("a rest held for a whole lesson still costs exactly two acts, never a meter", () => {
    const forever = drive([...APPROACH, ...REST(4, 300)]);
    expect(codes(forever.events).filter((c) => c === CODE)).toHaveLength(2);
  });

  it("driving on before the re-grade acquits it — the corrective can always be answered", () => {
    const corrected = drive([
      ...APPROACH,
      ...REST(4, 9),
      ...cruise(10, 40, { speedKmh: 30, noStopZone: true }),
    ]);
    expect(codes(corrected.events).filter((c) => c === CODE)).toHaveLength(1);
  });

  it("leaving the span acquits it too, and re-entering starts a fresh single bill", () => {
    const left = drive([
      ...APPROACH,
      ...REST(4, 9),
      ...cruise(10, 20, { speedKmh: 30 }), // out of the zone
      ...cruise(21, 24, { speedKmh: 30, noStopZone: true }),
      ...REST(25, 31),
    ]);
    // One bill for the first rest, one for the second — two acts, two charges,
    // and no re-grade on either (neither was held long enough).
    const bills = left.events.filter((e) => e.code === CODE);
    expect(bills).toHaveLength(2);
    expect(bills.every((b) => b.kind === "violation" && !b.regrade)).toBe(true);
  });

  it("every acquittal the first threshold accepts still acquits the second", () => {
    // A queue lead within `banZoneStopQueueGapM`, a person in the path, a red
    // light ahead: `illegalBanRest` is evaluated once and shared, so a rest that
    // is innocent at 4 s is innocent at 10 s.
    for (const over of [
      { leadGapM: 4 },
      { vruAheadM: 5 },
      { nextStopLineM: 3 },
      { nextStopLineControl: "trafficLight" as const, nextStopLineState: "red" as const },
    ]) {
      const innocent = drive([
        ...cruise(0, 3, { speedKmh: 30, noStopZone: true, ...over }),
        ...cruise(4, 60, { speedKmh: 0, noStopZone: true, ...over }),
      ]);
      expect(codes(innocent.events), JSON.stringify(over)).not.toContain(CODE);
    }
  });
});

// ---------------------------------------------------------------------------
// §2 — AND WHAT IT DOES TO A LESSON (the live consumers: `buildLessonResult`'s
//      `summary.mistakes` for the изпитен лист, and `lessonMistakes` for the
//      verdict `LessonPlayShell` and `SessionEndScreen` read)
// ---------------------------------------------------------------------------

function veh(x: number, y: number, speedKmh: number): VehicleSample {
  return {
    position: { x, y },
    headingDeg: 0,
    speedKmh,
    indicator: "off",
    headlights: "low",
    seatbeltOn: true,
    handbrakeOn: false,
    gear: 1,
    mirrorGlance: null,
  };
}

/**
 * ADR-009's OWN CONTROL. `lessonMistakeTargets` is the one field the ruling
 * reads (`lessons/lessonMistake.ts lessonMistakeTargetCodes`), so deleting it
 * from a COPY of the compiled lesson reproduces the pre-ADR-009 product exactly
 * — and nothing else about the drive moves, which is what makes the pair of
 * answers attributable to the ruling and to nothing else. Same pattern, same
 * reason, as `lessons/__tests__/busstop-ban-fail-path.test.ts` §3's.
 */
const stripLessonMistakeTargets = (lesson: LessonSpec): LessonSpec => {
  const copy = { ...lesson };
  delete (copy as { lessonMistakeTargets?: unknown }).lessonMistakeTargets;
  return copy;
};

/** The row's own drive: up the lane, stop beside the parked row, never move. */
function restOnTheSecondLine(tEnd: number, tweak?: (lesson: LessonSpec) => LessonSpec) {
  const template = SCENARIO_TEMPLATES.find((s) => s.id === "sc-pk-double-park");
  expect(template, "sc-pk-double-park must still be in the catalogue").toBeDefined();
  const compiled = compileScenario(template!, 1);
  // The premise ADR-009 rests on, asserted rather than inherited from a report:
  // this drill's own act IS the lesson's own mistake, at the rung §2 drives.
  expect(
    (compiled.lessonMistakeTargets ?? []).map((t) => t.code),
    "sc-pk-double-park@L1 must target its own act, or §2 measures nothing",
  ).toEqual([CODE]);
  const lesson = tweak === undefined ? compiled : tweak(compiled);
  expect(lesson.world?.districtId).toBe("pk-double-v1");
  const raw: unknown = JSON.parse(
    readFileSync(path.join(WORLD, "pk-double-v1.json"), "utf-8"),
  );
  const rt = createWorldRuntime(raw);
  let state: LessonSessionState = createLessonSession(lesson);
  let y = 5;
  for (let t = 0; t <= tEnd; t = Number((t + 0.1).toFixed(4))) {
    const speed = y >= 130 ? 0 : 30;
    y += (speed / 3.6) * 0.1;
    state = applyTick(state, rt.sample(veh(4.06, y, speed), t, false)).state;
    if (state.phase !== "driving" && state.phase !== "preDrive") break;
  }
  return buildLessonResult(state);
}

describe("§2 — sc-pk-double-park: its own act costs the lesson, and no points", () => {
  it("a rest held beside the parked row costs 0 т. and the lesson itself (ADR-009)", () => {
    const result = restOnTheSecondLine(80);
    // RULING A, FIRST HALF — no exam points for the first occurrence of the act
    // this lesson exists to teach. The re-bill `BAN_ZONE_REST_REGRADE_SEC`
    // earns at 10 s is dropped in `lessons/engine.ts`'s regrade guard, so the
    // изпитен лист the student reads is empty of it.
    expect(result.summary.mistakes.filter((m) => m.code === CODE)).toEqual([]);
    expect(result.summary.score.osnovniCount).toBe(0);
    expect(result.score).toBe(0);
    // RULING A, SECOND HALF — and the lesson is not taken. This is the live
    // consumer: `buildLessonResult` folds it once (`foldLessonMistakes`), the
    // end screen's verdict and the debrief's reason block read THIS field, and
    // `gradeFinishWire` folds the same call over the same two records.
    const hits = result.lessonMistakes ?? [];
    expect(hits.map((h) => ({ code: h.code, charged: h.charged }))).toEqual([
      { code: CODE, charged: false },
    ]);
    // THEO-4: never a bare verdict. The hit carries the act it was taught as —
    // `detail: "law-alongside"` retrieved to «Спиране до спряла кола», the ACT's
    // own catalogue row rather than the pooled чл. 98 one — so the reason block
    // can name the same act the card named (doc 92 ADDENDUM 1 item 1).
    expect(hits[0]!.detail).toBe("law-alongside");
    expect(hits[0]!.titleBg).toBe("Спиране до спряла кола");
    // The free mini-lesson is untouched: he was still SHOWN the card first.
    expect((result.coachedMistakes ?? []).map((c) => c.code)).toContain(CODE);
    // `passed` IS false here — and it is false for a second reason as well, so
    // it is not this section's discriminator and is not asserted as one: the
    // row's own drive stands still for ever and never reaches the finish
    // (`completedAll` false). The verdict half of Ruling A is pinned where the
    // route IS completed — `lessons/__tests__/lesson-mistake-verdict.test.ts`
    // §1 read with its §5: the same drive passes once the targets are stripped,
    // so `passed` there has exactly one cause. (This used to cite
    // `busstop-ban-fail-path.test.ts` §1; measured 2026-09-18, that section's
    // drives run `completedAll: false` and its `passed` is over-determined in
    // the same way this one is.)
    expect(result.completedAll).toBe(false);
  });

  it("…and it is ADR-009 withholding it: strip the targets and the −3 comes back", () => {
    // THE CONTROL. Only `lessonMistakeTargets` is removed, from a copy; the
    // district, the script, the rung and every threshold are the case above.
    const result = restOnTheSecondLine(80, stripLessonMistakeTargets);
    const charged = result.summary.mistakes.filter((m) => m.code === CODE);
    expect(charged, "the чл. 98 rest must reach summary.mistakes").toHaveLength(1);
    // основна = 3 наказателни точки, and the debrief's «Грешки» block prints it
    // with the catalogue's explanationBg and «✔ Правилното действие» (THEO-4).
    expect(charged[0]!.points).toBe(3);
    expect(result.score).toBeGreaterThanOrEqual(3);
    // WHICH bill it is, and WHEN — so §1's constant is measured through the
    // whole lesson chain and not only in the reducer: the charge is the
    // re-grade, and it lands `BAN_ZONE_REST_REGRADE_SEC` after the card the
    // free mini-lesson spent.
    expect(charged[0]!.regrade).toBe(true);
    const card = (result.coachedMistakes ?? []).find((c) => c.code === CODE);
    expect(card, "the free mini-lesson must still be the first bill").toBeDefined();
    expect(charged[0]!.t - card!.t).toBeCloseTo(BAN_ZONE_REST_REGRADE_SEC, 5);
    // With no targets there is no hit, so nothing about this drive is ADR-009's.
    expect(result.lessonMistakes ?? []).toEqual([]);
  });

  it("a drive that never stops in the span is byte-identical — nothing innocent moves", () => {
    const template = SCENARIO_TEMPLATES.find((s) => s.id === "sc-pk-double-park")!;
    const lesson = compileScenario(template, 1);
    const raw: unknown = JSON.parse(
      readFileSync(path.join(WORLD, "pk-double-v1.json"), "utf-8"),
    );
    const rt = createWorldRuntime(raw);
    let state: LessonSessionState = createLessonSession(lesson);
    let y = 5;
    for (let t = 0; t <= 40; t = Number((t + 0.1).toFixed(4))) {
      y += (30 / 3.6) * 0.1;
      state = applyTick(state, rt.sample(veh(4.06, y, 30), t, false)).state;
      if (state.phase !== "driving" && state.phase !== "preDrive") break;
    }
    const result = buildLessonResult(state);
    expect(result.summary.mistakes.map((m) => m.code)).not.toContain(CODE);
    expect((result.coachedMistakes ?? []).map((c) => c.code)).not.toContain(CODE);
    // ADR-009 refuses nothing here, and that is the half of the ruling worth
    // driving on an innocent tape: a lesson whose own mistake is armed must not
    // become a lesson that cannot be taken. The field is ABSENT rather than
    // empty on a clean drive (`buildLessonResult` spreads it in only when a hit
    // exists), which is what keeps a pre-ADR-009 stored row the same shape.
    expect(result.lessonMistakes).toBeUndefined();
  });
});
