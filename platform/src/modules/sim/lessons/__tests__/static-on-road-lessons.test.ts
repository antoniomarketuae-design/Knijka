/**
 * THE ON-ROAD STATIC CONTACT ON THE LESSON SURFACES — lane staticcardcopy,
 * sc-hz-brake-dont-swerve:b7297cb7. T4 (the crash pin) and T9 (the debrief's
 * dedupe), integrator rulings S4 and S10.
 *
 * T4. The crash pin reads the terminating bill's detail first. «staticObjectOnRoad»
 * is the same struck BODY as «staticObject» — only its paragraph differs — so
 * `asCrashPinBody` maps it to "staticObject" and the END (front / rear / …) is
 * still measured, keeping E9–E11 byte-identical. Without the mapping an
 * on-road bill names no body and the fallback ranks a same-tick UNBILLED
 * vehicle contact first — a drive cannot tell the difference (the same tick's
 * static contact names "staticObject" anyway), so the kill is a direct call.
 *
 * T9. The debrief's ROWS group by copy key (a kerb row and an on-road block row
 * are two rows under one title, each with its own «Какво стана»), but the two
 * DEDUPE questions ask the folded act (`rules/catalog.ts foldActDetail`): the
 * corrective already on the page prints once, and a coached strike stays hidden
 * behind a scored strike of the same mistake — exactly as base did when both
 * were "staticObject".
 */
import { describe, expect, it } from "vitest";
import { COLLISION_CONTACT_COPY, VIOLATIONS, type SimTick, type SimTickEvent } from "../../rules";
import { buildDebrief } from "../debrief";
import { applyTick, buildLessonResult, createLessonSession, finishSession } from "../engine";
import { asCrashPinBody, crashPinImpact } from "../finish";
import { compileScenario } from "../scenario/compile";
import { SC_HZ_BRAKE_DONT_SWERVE } from "../scenario/templates-hazards2";
import type { CoachedMistake } from "../types";
import { makeTick } from "./fixtures";

describe("T4 — the crash pin names the on-road bill's body as a static object (S4)", () => {
  it("KILLER: an on-road bill beside an UNBILLED same-tick vehicle contact names the static object, with the measured end", () => {
    const ends: unknown[] = [];
    const impact = crashPinImpact(50, ["staticObjectOnRoad"], ["staticObject", "vehicle"], (body) => {
      ends.push(body);
      return "front";
    });
    expect(impact, "the bill's own body — not the fallback's vehicle").toEqual({
      travel: "forward",
      body: "staticObject",
      end: "front",
    });
    expect(ends).toEqual(["staticObject"]);
  });

  it("the mapping, pinned directly: both act keys name their struck body", () => {
    expect(asCrashPinBody("staticObjectOnRoad")).toBe("staticObject");
    expect(asCrashPinBody("vehicleCutIn")).toBe("vehicle");
    for (const b of ["staticObject", "vehicle", "pedestrian", "cyclist"]) expect(asCrashPinBody(b)).toBe(b);
    expect(asCrashPinBody("some-future-body")).toBeNull();
  });

  it("an off-road bill is unchanged: the same call with «staticObject» gives the same answer", () => {
    expect(crashPinImpact(50, ["staticObject"], ["staticObject", "vehicle"], () => "front")).toEqual(
      crashPinImpact(50, ["staticObjectOnRoad"], ["staticObject", "vehicle"], () => "front"),
    );
  });
});

// ─────────────────────────────────────────────────────────────────────────
// T9 — THE DEBRIEF'S DEDUPE (S10)
// ─────────────────────────────────────────────────────────────────────────

const KERB: SimTickEvent = { kind: "collision", withWhat: "staticObject", actorId: "kerb" };
const BLOCK: SimTickEvent = { kind: "collision", withWhat: "staticObject", actorId: "block", onCarriageway: true };
const CORRECTIVE = VIOLATIONS.COLLISION.correctiveBg;

/** A coached rung of the drill (L1, «Пълна помощ»): two named static bodies
 *  struck 12 s apart, each its own contact episode. */
function drive(first: SimTickEvent, second: SimTickEvent | null) {
  const lesson = compileScenario(SC_HZ_BRAKE_DONT_SWERVE, 1);
  let s = createLessonSession(lesson);
  const ticks: SimTick[] = [];
  for (let i = 1; i <= 40; i++) {
    const t = i * 0.5;
    const events = i === 6 ? [first] : i === 30 && second !== null ? [second] : [];
    ticks.push(makeTick({ t, speedKmh: 30, position: { x: 4.06, y: 20 + t * 8 }, events }));
  }
  for (const t of ticks) s = applyTick(s, t).state;
  return { lesson, result: buildLessonResult(finishSession(s, 20)) };
}

const count = (text: string, needle: string) => text.split(needle).length - 1;

describe("T9 — one mistake, two sentences: the corrective prints once, the coached row stays hidden (S10)", () => {
  it("(i) a kerb strike, then a block strike: two «Какво стана» rows under one title, ONE «Правилното действие»", () => {
    const { lesson, result } = drive(KERB, BLOCK);
    const bills = result.summary.mistakes.filter((m) => m.code === "COLLISION").map((m) => m.detail);
    expect(bills, "both strikes are on the sheet").toEqual(["staticObject", "staticObjectOnRoad"]);
    const text = buildDebrief(lesson, result, { coachedMistakes: result.coachedMistakes }).text;
    // The expected display change: two rows, each saying what happened in its own words.
    expect(count(text, `→ Какво стана: ${COLLISION_CONTACT_COPY.staticObject.explanationBg}`)).toBe(1);
    expect(count(text, `→ Какво стана: ${COLLISION_CONTACT_COPY.staticObjectOnRoad.explanationBg}`)).toBe(1);
    expect(count(text, `• ${COLLISION_CONTACT_COPY.staticObject.titleBg}`)).toBe(2);
    // …and ONE corrective for the one mistake, wherever on the page it would print.
    expect(count(text, CORRECTIVE), "the pooled COLLISION corrective is printed more than once").toBe(1);
  });

  it("(i, mirrored) a block strike, then a kerb strike: still ONE «Правилното действие»", () => {
    const { lesson, result } = drive(BLOCK, KERB);
    expect(result.summary.mistakes.filter((m) => m.code === "COLLISION").map((m) => m.detail)).toEqual([
      "staticObjectOnRoad",
      "staticObject",
    ]);
    const text = buildDebrief(lesson, result, { coachedMistakes: result.coachedMistakes }).text;
    expect(count(text, `• ${COLLISION_CONTACT_COPY.staticObject.titleBg}`)).toBe(2);
    expect(count(text, CORRECTIVE), "the pooled COLLISION corrective is printed more than once").toBe(1);
  });

  it("(ii) a coached block strike, then a scored kerb strike: the coached row is hidden, as base hid it", () => {
    const { lesson, result } = drive(KERB, null);
    expect(result.summary.mistakes.filter((m) => m.code === "COLLISION").map((m) => m.detail)).toEqual(["staticObject"]);
    const coachedBlock: CoachedMistake = {
      code: "COLLISION",
      titleBg: COLLISION_CONTACT_COPY.staticObjectOnRoad.titleBg,
      t: 1,
      detail: "staticObjectOnRoad",
    };
    const withCoached = buildDebrief(lesson, result, { coachedMistakes: [...(result.coachedMistakes ?? []), coachedBlock] }).text;
    const without = buildDebrief(lesson, result, { coachedMistakes: [...(result.coachedMistakes ?? [])] }).text;
    expect(withCoached, "a coached strike of a mistake the sheet already charges must not reappear as a free row").toBe(without);
    expect(count(withCoached, CORRECTIVE)).toBe(1);
  });

  it("(ii, mirrored) a coached kerb strike behind a scored BLOCK strike is hidden too", () => {
    const { lesson, result } = drive(BLOCK, null);
    expect(result.summary.mistakes.filter((m) => m.code === "COLLISION").map((m) => m.detail)).toEqual(["staticObjectOnRoad"]);
    const coachedKerb: CoachedMistake = { code: "COLLISION", titleBg: COLLISION_CONTACT_COPY.staticObject.titleBg, t: 1, detail: "staticObject" };
    expect(
      buildDebrief(lesson, result, { coachedMistakes: [...(result.coachedMistakes ?? []), coachedKerb] }).text,
      "the coached kerb row that base hid behind a charged static strike reappeared",
    ).toBe(buildDebrief(lesson, result, { coachedMistakes: [...(result.coachedMistakes ?? [])] }).text);
  });

  it("…and the lesson's own mistake row (ADR-009 hit) for an on-road strike reads exactly as base's static hit behind a charged strike", () => {
    const { lesson, result } = drive(KERB, null);
    const hit = (detail: string) => ({
      ...result,
      lessonMistakes: [{ code: "COLLISION", t: 1, charged: false, detail, titleBg: COLLISION_CONTACT_COPY.staticObject.titleBg }],
    });
    const onRoad = buildDebrief(lesson, hit("staticObjectOnRoad"), { coachedMistakes: result.coachedMistakes }).text;
    const base = buildDebrief(lesson, hit("staticObject"), { coachedMistakes: result.coachedMistakes }).text;
    expect(onRoad, "a withheld hit of a mistake the sheet already charges must stay out of «Грешката на този урок»").toBe(base);
    expect(count(onRoad, CORRECTIVE)).toBe(1);
  });

  it("the same pair with the OFF-road coached row is base's own case, and reads the same", () => {
    const { lesson, result } = drive(KERB, null);
    const coachedKerb: CoachedMistake = { code: "COLLISION", titleBg: COLLISION_CONTACT_COPY.staticObject.titleBg, t: 1, detail: "staticObject" };
    expect(buildDebrief(lesson, result, { coachedMistakes: [coachedKerb] }).text).toBe(
      buildDebrief(lesson, result, { coachedMistakes: [] }).text,
    );
  });
});
