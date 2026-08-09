/**
 * Б1 „Пропусни движението" (give-way) adjudication — the give-way CAPABILITY.
 *
 * LAW (ADR-002 retrieval, content bank + docs/simulation/scenario-engine/
 * scenario-map.json, NOT free-recall):
 *   - Б2 „Стоп" (stopSign)  — full stop at the line ALWAYS, regardless of
 *     traffic (ЗДвП чл. 50; concept c-give-way-stop-behavior: „При Б2 спираш
 *     напълно на стоп-линията").
 *   - Б1 „Пропусни движението" (giveWay) — YIELD to priority traffic, but NO
 *     full stop when the mouth is clear (same чл. 50: „пълно спиране при Б1 се
 *     налага само когато иначе би ги засякъл", q-krastovishta-006). A clear-
 *     mouth roll is legal; a full stop is also legal.
 *
 * WIRING: a give-way line crossing emits stopLineCrossed{control:"giveWay"}
 * (graded: nothing at the line) PLUS, when the world's conflict-query pipeline
 * finds unyielded priority traffic at the mouth, a SEPARATE prioritySituation
 * {situation:"give-way", violated:true} — the reducer grades that as
 * FAILED_TO_YIELD (detail "give-way"), the same code/channel the uncontrolled
 * right-hand rule reuses. No new violation code (brief: prefer reuse).
 */

import { describe, expect, it } from "vitest";
import type { RuleEvent, SimTickEvent, ViolationEvent } from "../types";
import { codes, drive, tick } from "./fixtures";

const giveWay: SimTickEvent = { kind: "stopLineCrossed", control: "giveWay" };
const stopSign: SimTickEvent = { kind: "stopLineCrossed", control: "stopSign" };
const giveWayConflict: SimTickEvent = {
  kind: "prioritySituation",
  situation: "give-way",
  violated: true,
};

function violations(events: RuleEvent[]): ViolationEvent[] {
  return events.filter((e): e is ViolationEvent => e.kind === "violation");
}

describe("Б1 give-way adjudication (ЗДвП чл. 50 — yield, not full stop)", () => {
  it("rolling through a CLEAR give-way line = ZERO violations (the whole point)", () => {
    // Never stops, crosses the Б1 line at a roll, no conflicting traffic.
    const { events } = drive([
      tick(0, { speedKmh: 20 }),
      tick(1, { speedKmh: 18, events: [giveWay] }),
    ]);
    expect(violations(events)).toEqual([]);
    // Specifically NOT the Б2 full-stop опасна — that is the bug this fixes.
    expect(codes(events)).not.toContain("STOP_SIGN_NO_FULL_STOP");
  });

  it("give-way WITH an unyielded conflict = FAILED_TO_YIELD (detail give-way), never a stop demand", () => {
    const { events } = drive([
      tick(0, { speedKmh: 20 }),
      tick(1, { speedKmh: 18, events: [giveWay, giveWayConflict] }),
    ]);
    const vs = violations(events);
    expect(vs).toHaveLength(1);
    expect(vs[0]).toMatchObject({
      code: "FAILED_TO_YIELD",
      detail: "give-way",
      severityClass: "opasna",
      points: 10,
      lawRef: "ЗДвП чл. 47; чл. 48; чл. 50, ал. 1",
    });
    // The rolling cross itself must NOT add a full-stop опасна on top.
    expect(codes(events)).not.toContain("STOP_SIGN_NO_FULL_STOP");
  });

  it("a FULL STOP at a give-way line is legal — never penalized, and not the Б2 praise", () => {
    // Qualifying full stop (t=1,2 at ~0), then cross the Б1 line at t=3.
    const { events } = drive([
      tick(0, { speedKmh: 12 }),
      tick(1, { speedKmh: 0.4 }),
      tick(2, { speedKmh: 0.4 }),
      tick(3, { speedKmh: 6, events: [giveWay] }),
    ]);
    expect(violations(events)).toEqual([]);
    // FULL_STOP_AT_STOP_SIGN is Б2-specific praise — a Б1 line does not earn it.
    expect(codes(events)).not.toContain("FULL_STOP_AT_STOP_SIGN");
  });

  it("does not fabricate a yield grade on a clear give-way even after stopping", () => {
    const { events } = drive([
      tick(0, { speedKmh: 12 }),
      tick(1, { speedKmh: 0.4 }),
      tick(2, { speedKmh: 0.4 }),
      tick(3, { speedKmh: 6, events: [giveWay] }),
    ]);
    expect(codes(events)).not.toContain("FAILED_TO_YIELD");
  });
});

describe("Б2 stop-sign adjudication is UNCHANGED by the give-way branch", () => {
  it("rolling through a Б2 line without a full stop still grades STOP_SIGN_NO_FULL_STOP", () => {
    const { events } = drive([
      tick(0, { speedKmh: 20 }),
      tick(1, { speedKmh: 18, events: [stopSign] }),
    ]);
    const vs = violations(events);
    expect(vs).toHaveLength(1);
    expect(vs[0]).toMatchObject({
      code: "STOP_SIGN_NO_FULL_STOP",
      severityClass: "opasna",
      points: 10,
    });
  });

  it("a full stop at a Б2 line still earns FULL_STOP_AT_STOP_SIGN", () => {
    const { events } = drive([
      tick(0, { speedKmh: 12 }),
      tick(1, { speedKmh: 0.4 }),
      tick(2, { speedKmh: 0.4 }),
      tick(3, { speedKmh: 6, events: [stopSign] }),
    ]);
    expect(codes(events)).toContain("FULL_STOP_AT_STOP_SIGN");
    expect(codes(events)).not.toContain("STOP_SIGN_NO_FULL_STOP");
  });

  it("CONTRAST: a Б2 line with a conflict bills BOTH the full-stop AND the yield; a Б1 line bills only the yield", () => {
    // Б2: rolled through + conflict → two опасни (stop demand + failed yield).
    const b2 = drive([
      tick(0, { speedKmh: 20 }),
      tick(1, { speedKmh: 18, events: [stopSign, giveWayConflict] }),
    ]);
    expect(codes(b2.events).sort()).toEqual(["FAILED_TO_YIELD", "STOP_SIGN_NO_FULL_STOP"]);
    // Б1: same roll + same conflict → only the yield опасна (no stop demand).
    const b1 = drive([
      tick(0, { speedKmh: 20 }),
      tick(1, { speedKmh: 18, events: [giveWay, giveWayConflict] }),
    ]);
    expect(codes(b1.events)).toEqual(["FAILED_TO_YIELD"]);
  });
});
