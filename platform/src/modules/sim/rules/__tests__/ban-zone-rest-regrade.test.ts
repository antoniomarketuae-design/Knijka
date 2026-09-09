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
 * them; §2 pins that the second bill actually reaches the student's sheet,
 * which is the only reason the first half is worth anything.
 */

const CODE = "ILLEGAL_STOP_IN_BAN_ZONE";
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
    expect(bills[1].t - bills[0].t).toBeCloseTo(6, 5);
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
// §2 — AND IT REACHES THE STUDENT'S SHEET (the live consumer)
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

/** The row's own drive: up the lane, stop beside the parked row, never move. */
function restOnTheSecondLine(tEnd: number) {
  const template = SCENARIO_TEMPLATES.find((s) => s.id === "sc-pk-double-park");
  expect(template, "sc-pk-double-park must still be in the catalogue").toBeDefined();
  const lesson = compileScenario(template!, 1);
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

describe("§2 — sc-pk-double-park charges the act its whole lesson is about", () => {
  it("a rest held beside the parked row lands on the exam sheet, not only on a card", () => {
    const result = restOnTheSecondLine(80);
    const charged = result.summary.mistakes.filter((m) => m.code === CODE);
    expect(charged, "the чл. 98 rest must reach summary.mistakes").toHaveLength(1);
    // основна = 3 наказателни точки, and the debrief's «Грешки» block prints it
    // with the catalogue's explanationBg and «✔ Правилното действие» (THEO-4).
    expect(charged[0].points).toBe(3);
    expect(result.score).toBeGreaterThanOrEqual(3);
    // The free mini-lesson is untouched: he was still SHOWN the card first.
    expect((result.coachedMistakes ?? []).map((c) => c.code)).toContain(CODE);
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
  });
});
