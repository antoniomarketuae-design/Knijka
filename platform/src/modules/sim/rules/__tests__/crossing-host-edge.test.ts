/**
 * H-6 — the host-edge gate on `crossingPassed` (audit 80, „The rule engine
 * punishes correct driving").
 *
 * A crossing zone arms from the zebra's host edge AND every edge sharing a node
 * with it, and the pass test that follows is an ahead→behind sweep with a 22 m
 * lateral budget (sized for the outer lane of a 6-lane arterial). At a junction
 * those two together hand the reducer passes for the SIDE STREETS' zebras: a
 * full district sweep produced 36 off-host-edge passes, 25 of them for a zebra
 * the car never came within 8 m of. The live lesson/exam preset walks 20
 * pedestrians over 51 crossings, so one of those zebras is near-certainly
 * occupied — and `PEDESTRIAN_NOT_YIELDED` is a 10-point опасна that ENDS the
 * exam (lessons/exam.ts). A student who drove past a side street perfectly was
 * being failed for it.
 *
 * The gate: the act graded here is DRIVING OVER THE PAINT, so the car must be
 * on the road the paint is on. `crossingPassed.hostEdgeId` names the crossing's
 * segment in the same id space as `SimTick.edgeId`; an affirmative mismatch
 * means we were near the zebra, never at it.
 *
 * Every case below fails without the gate except the ones explicitly marked as
 * regression guards (which lock in that the gate is purely SUBTRACTIVE and can
 * never grade something the old reducer let pass).
 */

import { describe, expect, it } from "vitest";
import type { RuleEvent, SimTick, SimTickEvent } from "../types";
import { codes, cruise, drive, tick } from "./fixtures";

/** The street the student is actually driving on in every case here. */
const MAIN = "e-main";

const entered = (crossingId: string, pedestrianOnCrossing: boolean): SimTickEvent => ({
  kind: "crossingZoneEntered",
  crossingId,
  pedestrianOnCrossing,
});

/** A pass the runtime attributes to a named host segment (the H-6 contract). */
const passedOn = (
  crossingId: string,
  pedestrianOnCrossing: boolean,
  hostEdgeId: string | null,
): SimTickEvent => ({ kind: "crossingPassed", crossingId, pedestrianOnCrossing, hostEdgeId });

/** A pass from a source that names no host segment (every legacy runtime). */
const passedAnonymously = (crossingId: string, pedestrianOnCrossing: boolean): SimTickEvent => ({
  kind: "crossingPassed",
  crossingId,
  pedestrianOnCrossing,
});

function violations(events: RuleEvent[]): string[] {
  return events.filter((e) => e.kind === "violation").map((e) => e.code);
}

// ---------------------------------------------------------------------------
// The gate itself
// ---------------------------------------------------------------------------

describe("PEDESTRIAN_NOT_YIELDED — host-edge gate (H-6)", () => {
  it("still convicts when the car drove over THIS crossing's paint", () => {
    // The whole point of the code: the zebra is on the street under the wheels,
    // a pedestrian is on it, and the car went through anyway (ЗДвП чл. 119).
    const { events } = drive([
      tick(0, { speedKmh: 20, edgeId: MAIN, events: [entered("x-main", true)] }),
      tick(1, { speedKmh: 18, edgeId: MAIN }),
      tick(2, { speedKmh: 18, edgeId: MAIN, events: [passedOn("x-main", true, MAIN)] }),
    ]);
    expect(codes(events)).toContain("PEDESTRIAN_NOT_YIELDED");
  });

  it("does NOT convict for a zebra on the side street we merely swept past", () => {
    // The H-6 false positive. Identical event stream to the case above, except
    // the crossing is painted on a different road: the 22 m lateral budget
    // caught it as the car crossed the junction mouth. Nothing happened here —
    // the student never approached that zebra, never mind failed to yield.
    const { events } = drive([
      tick(0, { speedKmh: 45, edgeId: MAIN, events: [entered("x-side", false)] }),
      tick(1, { speedKmh: 45, edgeId: MAIN }),
      tick(2, { speedKmh: 45, edgeId: MAIN, events: [passedOn("x-side", true, "e-side")] }),
    ]);
    expect(violations(events)).toEqual([]);
  });

  it("does not hand out PEDESTRIAN_YIELDED for a zebra we never reached either", () => {
    // The mirror of the conviction: a slow, careful roll past a junction whose
    // side-street zebra happened to clear must not be praised as yielding. The
    // commendation is a teaching signal — awarding it for a non-event teaches
    // the wrong lesson just as surely as the опасна did.
    const { events } = drive([
      tick(0, { speedKmh: 8, edgeId: MAIN, events: [entered("x-side", true)] }),
      tick(1, { speedKmh: 6, edgeId: MAIN }),
      tick(2, { speedKmh: 6, edgeId: MAIN, events: [passedOn("x-side", false, "e-side")] }),
    ]);
    expect(codes(events)).not.toContain("PEDESTRIAN_YIELDED");
  });

  it("closes the armed zone anyway, so it cannot outlive its geometry", () => {
    // An ungraded pass is still a pass: the zebra is behind us. If the state
    // stayed armed, every zone-conditioned rule would ride along for the rest
    // of the session — the same defect `crossingZoneExited` exists to close
    // (audit H-5, the sticky-zone half).
    const { state } = drive([
      tick(0, { speedKmh: 45, edgeId: MAIN, events: [entered("x-side", true)] }),
      tick(1, { speedKmh: 45, edgeId: MAIN, events: [passedOn("x-side", true, "e-side")] }),
    ]);
    expect(state.crossing).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// Regression guards — the gate is subtractive, and only on two KNOWN facts
// ---------------------------------------------------------------------------

describe("host-edge gate — sources that cannot be compared grade as before", () => {
  it("grades a pass from a runtime that names no host segment", () => {
    // Regression: scenario traces, the orchestrator's synthetic events and
    // every pre-H-6 runtime emit a bare `crossingPassed`. Unknown must not
    // become a silent acquittal — those drives grade byte-identically.
    const { events } = drive([
      tick(0, { speedKmh: 20, edgeId: MAIN, events: [entered("x1", true)] }),
      tick(1, { speedKmh: 18, edgeId: MAIN, events: [passedAnonymously("x1", true)] }),
    ]);
    expect(codes(events)).toContain("PEDESTRIAN_NOT_YIELDED");
  });

  it("grades a pass when the tick reports no road fix at all", () => {
    // Regression: `edgeId` is optional in the SimTick contract (legacy sources)
    // and `null` means off-road/unknown. With nothing to compare the crossing
    // against, the gate stands down rather than inventing an acquittal.
    const noFix = drive([
      tick(0, { speedKmh: 20, events: [entered("x1", true)] }),
      tick(1, { speedKmh: 18, events: [passedOn("x1", true, "e-somewhere")] }),
    ]);
    expect(codes(noFix.events)).toContain("PEDESTRIAN_NOT_YIELDED");

    const lostFix = drive([
      tick(0, { speedKmh: 20, edgeId: null, events: [entered("x1", true)] }),
      tick(1, { speedKmh: 18, edgeId: null, events: [passedOn("x1", true, "e-somewhere")] }),
    ]);
    expect(codes(lostFix.events)).toContain("PEDESTRIAN_NOT_YIELDED");
  });

  it("grades a pass the runtime attributes to no segment (hostEdgeId null)", () => {
    // Regression: a crossing authored on a non-drivable way carries no host
    // edge. Unknown is unknown — it must not read as „another street".
    const { events } = drive([
      tick(0, { speedKmh: 20, edgeId: MAIN, events: [entered("x1", true)] }),
      tick(1, { speedKmh: 18, edgeId: MAIN, events: [passedOn("x1", true, null)] }),
    ]);
    expect(codes(events)).toContain("PEDESTRIAN_NOT_YIELDED");
  });
});

// ---------------------------------------------------------------------------
// The A12 scene — the drive the audit measured
// ---------------------------------------------------------------------------

describe("A12 scene — a junction sweep past ambient pedestrians", () => {
  it("convicts nothing while four side-street zebras are occupied", () => {
    // The exact shape of the H-6 report, as a drive: the student holds a legal
    // 45 in a 50 zone along a straight arterial and crosses four junction
    // mouths. Every side street has a zebra within the 22 m lateral budget, and
    // the lesson/exam preset (DEFAULT_LESSON_TRAFFIC, 20 pedestrians) has
    // someone on each of them at the moment the mouth sweeps by. Their own
    // zebra on the arterial is clear, and they drive it correctly.
    //
    // Before the gate this drive collected four 10-point опасни and the exam
    // ended on the first of them. It must now collect nothing at all.
    const sideStreets = ["e-side-a", "e-side-b", "e-side-c", "e-side-d"];
    const ticks: SimTick[] = [];
    let t = 0;
    for (const street of sideStreets) {
      const zebra = `x-${street}`;
      // The mouth comes into range with the zebra clear — an ambient walker
      // only steps onto it as we are alongside, which is precisely why the flag
      // sampled at the pass reads true.
      ticks.push(tick(t, { speedKmh: 45, edgeId: MAIN, events: [entered(zebra, false)] }));
      ticks.push(tick(t + 1, { speedKmh: 45, edgeId: MAIN }));
      ticks.push(
        tick(t + 2, { speedKmh: 45, edgeId: MAIN, events: [passedOn(zebra, true, street)] }),
      );
      t += 3;
    }
    // ...and the arterial's own zebra, taken properly: clear, and slowed for.
    ticks.push(tick(t, { speedKmh: 30, edgeId: MAIN, events: [entered("x-main", false)] }));
    ticks.push(tick(t + 1, { speedKmh: 22, edgeId: MAIN }));
    ticks.push(
      tick(t + 2, { speedKmh: 22, edgeId: MAIN, events: [passedOn("x-main", false, MAIN)] }),
    );

    const { events } = drive(ticks);
    expect(violations(events)).toEqual([]);
  });

  it("the one zebra the student really did run still fails the exam", () => {
    // The other half of the contract: the gate must not turn into a blanket
    // amnesty. Same sweep, but this time the pedestrian is on the ARTERIAL's
    // own crossing and the student drives through — that is the опасна, and it
    // is the only one.
    const ticks: SimTick[] = [
      ...cruise(0, 4, { speedKmh: 45, edgeId: MAIN }),
      tick(5, { speedKmh: 45, edgeId: MAIN, events: [entered("x-side-a", true)] }),
      tick(6, { speedKmh: 45, edgeId: MAIN, events: [passedOn("x-side-a", true, "e-side-a")] }),
      tick(7, { speedKmh: 45, edgeId: MAIN, events: [entered("x-main", true)] }),
      tick(8, { speedKmh: 45, edgeId: MAIN, events: [passedOn("x-main", true, MAIN)] }),
    ];
    const { events } = drive(ticks);
    expect(violations(events)).toEqual(["PEDESTRIAN_NOT_YIELDED"]);
  });
});
