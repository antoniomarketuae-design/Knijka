/**
 * ONE CODE, THREE ACTS, ONE STRING — the catalogue sweep's two rail findings
 * (2026-08-16), locked from both directions.
 *
 * What was photographed:
 *   `sc-rx-guarded/pc-wrong/08-debrief.png` — a lesson titled «Охраняем прелез
 *   с бариера», convicted (1 опасна, 10 наказателни точки) with a card that
 *   OPENED „Пред прелез БЕЗ бариери спираш напълно…". The verdict named a rule
 *   that does not govern the crossing the student had just driven through.
 *   `sc-rx-unguarded/mobile-right/08-debrief.png` — a drive with 23 full stops
 *   and a ✓ on «Спри напълно на стоп-линията преди релсите», convicted for
 *   resting ON the rails, reading that SAME opening sentence: the copy
 *   described the opposite of what the drive had done, and neither screen ever
 *   said which of the three acts had been committed.
 *
 * `engine.ts` has stamped the discriminator on every event all along
 * (`detail`: "no-stop" | "entered-barred" | "stopped-on-track" — pinned arm by
 * arm in `rail-crossing-detectors.test.ts`); only the copy was pooled.
 * `catalog.ts makeViolation` now resolves title/explanation/lawRef from it.
 *
 * THE MEASUREMENT, and it is the whole point of this file: the three drives
 * below produced ONE explanation string between them before the fix (set size
 * 1) and produce three after it (set size 3) — so every assertion here that
 * counts distinct copy fails on the old catalogue. The other direction is
 * guarded too: an unknown detail must fall BACK to the pooled row rather than
 * to some looser text that fits everybody, the pooled row must stay true of
 * all three acts (it is read BY CODE, with no event in hand), and the split
 * must not reach severity, points or the exam charge.
 */

import { describe, expect, it } from "vitest";

import { RAIL_CROSSING_ACT_COPY, VIOLATIONS, makeViolation } from "../catalog";
import type { RuleEvent, ViolationEvent } from "../types";
import { cruise, drive, tick } from "./fixtures";

const ROW = VIOLATIONS.RAIL_CROSSING_VIOLATION;

function railViolations(events: RuleEvent[]): ViolationEvent[] {
  return events.filter(
    (e): e is ViolationEvent => e.kind === "violation" && e.code === "RAIL_CROSSING_VIOLATION",
  );
}

/** Unguarded band entered with no qualifying stop — RX-02, detail "no-stop". */
function driveNoStop(): ViolationEvent[] {
  return railViolations(
    drive([
      tick(0, { speedKmh: 30, railCrossing: "approach" }),
      tick(1, { speedKmh: 30, railCrossing: "approach" }),
      tick(2, { speedKmh: 30, railCrossing: "on" }),
      tick(3, { speedKmh: 30, railCrossing: "on" }),
      tick(4, { speedKmh: 30 }),
    ]).events,
  );
}

/** The barrier dived under — RX-01, detail "entered-barred". */
function driveBarred(): ViolationEvent[] {
  return railViolations(
    drive([
      tick(0, { speedKmh: 30, railCrossing: "approach", railGuarded: true, railBarred: true }),
      tick(1, { speedKmh: 30, railCrossing: "approach", railGuarded: true, railBarred: true }),
      tick(2, { speedKmh: 30, railCrossing: "on", railGuarded: true, railBarred: true }),
      tick(3, { speedKmh: 30, railCrossing: "on", railGuarded: true, railBarred: true }),
      tick(4, { speedKmh: 30 }),
    ]).events,
  );
}

/**
 * The founder's 23-stop drive in miniature: the mandatory stop IS made (so the
 * entry is innocent), and the car then comes to rest on the band — RX-03,
 * detail "stopped-on-track".
 */
function driveRestOnTrack(): ViolationEvent[] {
  return railViolations(
    drive([
      tick(0, { speedKmh: 20, railCrossing: "approach" }),
      tick(1, { speedKmh: 0, railCrossing: "approach" }),
      tick(2, { speedKmh: 0, railCrossing: "approach" }),
      tick(3, { speedKmh: 10, railCrossing: "on" }),
      ...cruise(4, 6, { speedKmh: 0, railCrossing: "on" }),
      tick(7, { speedKmh: 15, railCrossing: "on" }),
      tick(8, { speedKmh: 25 }),
    ]).events,
  );
}

describe("RAIL_CROSSING_VIOLATION names the act the student actually committed", () => {
  it("POSITIVE CONTROL: the three drives really do convict, one card each", () => {
    // Without this, every distinctness assertion below would pass on three
    // empty arrays — the shape of false pass this sweep exists to refuse.
    for (const [name, v] of [
      ["no-stop", driveNoStop()],
      ["entered-barred", driveBarred()],
      ["stopped-on-track", driveRestOnTrack()],
    ] as const) {
      expect(v, name).toHaveLength(1);
      expect(v[0].detail, name).toBe(name);
    }
  });

  it("THE MEASUREMENT: three acts, three cards — was 1 distinct string, now 3", () => {
    const cards = [driveNoStop()[0], driveBarred()[0], driveRestOnTrack()[0]];
    expect(new Set(cards.map((c) => c.explanationBg)).size).toBe(3);
    expect(new Set(cards.map((c) => c.titleBg)).size).toBe(3);
    expect(new Set(cards.map((c) => c.lawRef)).size).toBe(3);
  });

  it("the guarded lesson is no longer convicted with the WITHOUT-barriers rule", () => {
    const card = driveBarred()[0];
    // The sc-rx-guarded defect, literally: the fired card opened with the
    // unguarded branch. It may not mention that branch at all now.
    expect(card.explanationBg).not.toMatch(/без бариери/i);
    expect(card.titleBg).not.toMatch(/без бариери/i);
    expect(card.explanationBg).toMatch(/бариер/i);
    // …and it must cite the article that bans THIS act, not the stop duty of a
    // crossing that has no barrier to obey.
    expect(card.lawRef).toBe("ЗДвП чл. 52");
  });

  it("the 23-stop drive is told it stopped ON the rails, not that it failed to stop", () => {
    const card = driveRestOnTrack()[0];
    // The sc-rx-unguarded defect: the opening sentence demanded a full stop of
    // a drive whose fault was stopping in the wrong place.
    expect(card.explanationBg).toMatch(/върху/i);
    expect(card.explanationBg).toMatch(/релс/i);
    expect(card.explanationBg).not.toMatch(/без бариери/i);
    expect(card.lawRef).toBe("ЗДвП чл. 53, ал. 2");
  });

  it("the unguarded roll-through still gets the stop rule, and its own article", () => {
    const card = driveNoStop()[0];
    expect(card.explanationBg).toMatch(/без бариери/i);
    expect(card.explanationBg).not.toMatch(/спуснат/i);
    expect(card.lawRef).toBe("ЗДвП чл. 51, ал. 3");
  });

  it("two acts in one drive read as two different lessons", () => {
    // A no-stop entry AND a rest on the band — the same code twice. Before the
    // split the student read the identical paragraph on both cards.
    const v = railViolations(
      drive([
        tick(0, { speedKmh: 30, railCrossing: "approach" }),
        tick(1, { speedKmh: 30, railCrossing: "approach" }),
        tick(2, { speedKmh: 25, railCrossing: "on" }),
        ...cruise(3, 7, { speedKmh: 0, railCrossing: "on" }),
        tick(8, { speedKmh: 20 }),
      ]).events,
    );
    expect(v.map((e) => e.detail)).toEqual(["no-stop", "stopped-on-track"]);
    expect(v[0].explanationBg).not.toBe(v[1].explanationBg);
    expect(v[0].titleBg).not.toBe(v[1].titleBg);
  });
});

describe("the split may not become a looser check that fits everybody", () => {
  it("the CATALOGUE row stays true of all three acts — it is read by CODE", () => {
    // tutor/retrieval, lesson/resolve and clipPlanBuilder look this up with no
    // event in hand, so it must teach all three rules and assert no act.
    expect(ROW.explanationBg).toMatch(/без бариери/i); // the unguarded stop duty
    expect(ROW.explanationBg).toMatch(/спуснат/i); // the barred entry ban
    expect(ROW.explanationBg).toMatch(/върху релсите/i); // the rest on the band
    // The corrective has no per-event channel at all (it is looked up by code
    // at display time), so it must walk all three branches forever.
    expect(ROW.correctiveBg).toMatch(/без бариери/i);
    expect(ROW.correctiveBg).toMatch(/бариери/i);
    expect(ROW.correctiveBg).toMatch(/коловоз|релс/i);
    // No act's card may simply BE the pooled row — that would be the split
    // silently doing nothing.
    for (const act of Object.values(RAIL_CROSSING_ACT_COPY)) {
      expect(act.explanationBg).not.toBe(ROW.explanationBg);
    }
  });

  it("an UNRECOGNISED detail falls back to the pooled row, never to silence", () => {
    const e = makeViolation("RAIL_CROSSING_VIOLATION", 3, { detail: "some-future-arm" });
    expect(e.explanationBg).toBe(ROW.explanationBg);
    expect(e.titleBg).toBe(ROW.titleBg);
    expect(e.lawRef).toBe(ROW.lawRef);
    // And a detail-less event (procedures/machine.ts, replays) is unchanged.
    const bare = makeViolation("RAIL_CROSSING_VIOLATION", 3);
    expect(bare.explanationBg).toBe(ROW.explanationBg);
    expect(bare.lawRef).toBe(ROW.lawRef);
  });

  it("an explicit override still outranks the per-act copy", () => {
    const e = makeViolation("RAIL_CROSSING_VIOLATION", 3, {
      detail: "entered-barred",
      titleBg: "T",
      explanationBg: "E",
    });
    expect(e.titleBg).toBe("T");
    expect(e.explanationBg).toBe("E");
  });

  it("no other code is touched by the act channel", () => {
    // The detail field is shared (priority.test.ts drives „emergency" through
    // it); only the rail code may read it as an act key.
    const e = makeViolation("FAILED_TO_YIELD", 1, { detail: "no-stop" });
    expect(e.explanationBg).toBe(VIOLATIONS.FAILED_TO_YIELD.explanationBg);
    expect(e.lawRef).toBe(VIOLATIONS.FAILED_TO_YIELD.lawRef);
  });

  it("the split reaches copy only — never the charge", () => {
    const cards = [driveNoStop()[0], driveBarred()[0], driveRestOnTrack()[0]];
    for (const c of cards) {
      expect(c.severityClass).toBe(ROW.severityClass);
      expect(c.points).toBe(ROW.points);
      expect(c.terminateSession).toBeUndefined(); // COLLISION stays the only one
    }
    // Each per-act citation is a NARROWING of the row's, not a new claim: the
    // row cites all three articles, the event cites the one its act breaks.
    for (const act of Object.values(RAIL_CROSSING_ACT_COPY)) {
      expect(ROW.lawRef).toContain(act.lawRef.replace(/^ЗДвП\s+/, ""));
      expect(act.lawRef).toMatch(/^ЗДвП чл\./);
    }
  });
});
