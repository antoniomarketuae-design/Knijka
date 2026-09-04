/**
 * ADR-006 stage 1c integration — policeStop against the REAL district (doc 72
 * VP-11 „Спиране по полицейски сигнал", ЗДвП чл. 103). Site: the same 352 m
 * two-way residential east arm the emergency-approach suite uses
 * (e519275131.0), mid-block — far from any junction machinery.
 *
 * The runner stages the standing officer figure (a staged pedestrian, pose
 * "stopSignal", never walked) and records the outcome — "yielded" for a
 * compliant curb-side rest, "passedWithoutStopping" for driving on.
 *
 * ── THIS FILE'S CONTRACT CHANGED ON 2026-09-04 (sc-vp-police-stop:44cfeff6) ──
 * It used to assert that the runner emits ZERO SimTick events, and titled that
 * „the hard A12 guarantee". The audit showed what the guarantee cost: on the
 * drill whose entire subject is обеying a stop signal, the only thing a pass-by
 * could be convicted of was whatever the student happened to hit — „a student
 * who ignores the officer without crashing would not be caught". A12 forbids
 * convicting an UNMODELLED duty, and this duty is modelled to the metre by the
 * spec's own halt contract and `passBeyondM`; so the expectations below now
 * assert the adjudication instead of its absence, in both directions and with
 * the once-per-attempt bound the old file could not even state. The telltale
 * twin (`telltale-stimulus.test.ts`) made the same move on 2026-09-02 and is
 * the shape copied here.
 *
 * What has NOT changed and is still asserted: the runner stages no vehicle, so
 * it can never manufacture a contact, and the graded COMPLETION still lives in
 * the scenario's curb-side reachZone objective.
 */

import { describe, expect, it } from "vitest";
import type { PoliceStopSpec } from "../../contracts";
import {
  commendationCodes,
  DT,
  loadRawDistrict,
  makeStack,
  offsetRight,
  PolyDriver,
  stepFrame,
  violationCodes,
} from "./helpers";

const EDGE = "e519275131.0";
/** Scaled lane-center offset for the right lane of a 2-lane two-way edge. */
const LANE_OFFSET = 4.0625;

function edgeGeometry(): Array<[number, number]> {
  const raw = loadRawDistrict();
  const edge = raw.roads.edges.find((e) => e.id === EDGE);
  if (!edge) throw new Error(`edge ${EDGE} not in district`);
  return edge.geometry.map((p) => [p[0], p[1]]);
}

/** Officer on the sidewalk band + halt point at the curb side, both derived
 *  from the SAME edge polyline (arc ~100 m along the block). */
function siteAtArc(arcM: number): { officer: { x: number; y: number }; stop: { x: number; y: number } } {
  const officerPath = offsetRight(edgeGeometry(), LANE_OFFSET + 4.5);
  const stopPath = offsetRight(edgeGeometry(), LANE_OFFSET + 1.6);
  const o = new PolyDriver(officerPath).poseAt(arcM + 4);
  const s = new PolyDriver(stopPath).poseAt(arcM);
  return { officer: { x: o.x, y: o.y }, stop: { x: s.x, y: s.y } };
}

function policeSpec(): PoliceStopSpec {
  const site = siteAtArc(100);
  const dx = site.stop.x - site.officer.x;
  const dy = site.stop.y - site.officer.y;
  const len = Math.hypot(dx, dy) || 1;
  return {
    id: "t-police",
    kind: "policeStop",
    officer: site.officer,
    facing: { x: dx / len, y: dy / len }, // toward the roadway
    stop: site.stop,
    stopRadiusM: 3,
    stopSpeedKmh: 4,
    passBeyondM: 25,
    // A uniformed officer, so his signal binds under чл. 103 — the flag
    // `sc-vp-police-stop` authors and `sc-pe-school-patrol`'s warden does not
    // (see contracts.ts `bindingUnderArt103`). `wardenSpec()` below is the
    // other half of that pair and asserts the silence.
    bindingUnderArt103: true,
  };
}

/** The SAME staged kind without the чл. 103 flag — a school crossing warden. */
function wardenSpec(): PoliceStopSpec {
  const { bindingUnderArt103: _drop, ...rest } = policeSpec();
  return { ...rest, id: "t-warden" };
}

describe("policeStop (integration)", () => {
  it("stages the standing officer figure: pose 'stopSignal', never walks, at its post", () => {
    const stack = makeStack([policeSpec()]);
    const spec = policeSpec();
    const officer = stack.traffic.pedestrians.find((p) => p.pose === "stopSignal")!;
    expect(officer).toBeDefined();
    expect(officer.x).toBeCloseTo(spec.officer.x, 3);
    expect(officer.y).toBeCloseTo(spec.officer.y, 3);
    const path = offsetRight(edgeGeometry(), LANE_OFFSET);
    const driver = new PolyDriver(path, 20);
    for (let i = 0; i < 10 * 30; i++) stepFrame(stack, driver.advance(DT, 10));
    expect(officer.x).toBeCloseTo(spec.officer.x, 3); // still at the post
    expect(officer.speedMps).toBe(0);
  });

  it("compliant: pulling over and resting at the halt point resolves 'yielded' — zero rule events", () => {
    const spec = policeSpec();
    const stack = makeStack([spec]);
    // Approach on the lane center, then ease onto the curb-side line that
    // passes through the halt point and stand there.
    const pullOver = offsetRight(edgeGeometry(), LANE_OFFSET + 1.6);
    const driver = new PolyDriver(pullOver, 20);
    for (let i = 0; i < 60 * 30 && stack.outcomes.length === 0; i++) {
      const target = driver.s >= 95 ? 0 : 9; // brake to rest AT the halt point
      stepFrame(stack, driver.advance(DT, target));
    }
    expect(stack.outcomes).toHaveLength(1);
    expect(stack.outcomes[0]).toMatchObject({
      eventId: "t-police",
      kind: "policeStop",
      success: true,
      detail: "yielded",
    });
    // The compliant leg convicts NOTHING and is PRAISED — THEO-4: a drill that
    // can only convict teaches half a rule.
    expect(violationCodes(stack.ruleEvents)).toEqual([]);
    expect(commendationCodes(stack.ruleEvents)).toEqual(["YIELDED_TO_PRIORITY"]);
  });

  it("ignoring the signal records 'passedWithoutStopping' and grades POLICE_STOP_SIGNAL_IGNORED — once", () => {
    const stack = makeStack([policeSpec()]);
    const path = offsetRight(edgeGeometry(), LANE_OFFSET);
    const driver = new PolyDriver(path, 20);
    for (let i = 0; i < 60 * 30 && stack.outcomes.length === 0; i++) {
      stepFrame(stack, driver.advance(DT, 11)); // ~40 km/h, straight past
      if (driver.s >= driver.length) break;
    }
    expect(stack.outcomes).toHaveLength(1);
    expect(stack.outcomes[0]).toMatchObject({ success: false, detail: "passedWithoutStopping" });
    // The pass-by is now BILLED, and billed exactly once: the
    // "police-stop-signal" prioritySituation is emitted on the resolving frame
    // and on no other, so the drive that ignored one officer carries one
    // основна and not a per-frame stream of them.
    expect(violationCodes(stack.ruleEvents)).toEqual(["POLICE_STOP_SIGNAL_IGNORED"]);
    expect(commendationCodes(stack.ruleEvents)).toEqual([]);
    const priorityEvents = stack.ticks.flatMap((tick) =>
      tick.events.filter((e) => e.kind === "prioritySituation"),
    );
    expect(priorityEvents).toEqual([
      { kind: "prioritySituation", situation: "police-stop-signal", violated: true },
    ]);
    // Still nothing physical: the runner stages a standing figure and no
    // vehicle, so it can never manufacture a contact.
    for (const tick of stack.ticks) {
      expect(tick.events.filter((e) => e.kind === "collision")).toEqual([]);
    }
  });

  it("one adjudication per attempt; reset() re-arms the encounter", () => {
    const spec = policeSpec();
    const stack = makeStack([spec]);
    const path = offsetRight(edgeGeometry(), LANE_OFFSET);
    let driver = new PolyDriver(path, 20);
    for (let i = 0; i < 60 * 30 && stack.outcomes.length === 0; i++) {
      stepFrame(stack, driver.advance(DT, 11));
      if (driver.s >= driver.length) break;
    }
    expect(stack.outcomes).toHaveLength(1);
    // Driving on past the resolution never re-fires.
    for (let i = 0; i < 5 * 30; i++) stepFrame(stack, driver.advance(DT, 11));
    expect(stack.outcomes).toHaveLength(1);
    // Retry: the runner re-arms and adjudicates the fresh attempt.
    stack.director.reset();
    expect(stack.director.snapshot()[0].phase).toBe("armed");
    driver = new PolyDriver(path, 20);
    for (let i = 0; i < 60 * 30 && stack.outcomes.length < 2; i++) {
      stepFrame(stack, driver.advance(DT, 11));
      if (driver.s >= driver.length) break;
    }
    expect(stack.outcomes).toHaveLength(2);
    // ONE bill per adjudication — which is this test's own title, and it is
    // only checkable now that the runner bills at all. Two ignored signals
    // across two attempts, two основни; the five seconds of driving on past the
    // first resolution added none.
    expect(violationCodes(stack.ruleEvents)).toEqual([
      "POLICE_STOP_SIGNAL_IGNORED",
      "POLICE_STOP_SIGNAL_IGNORED",
    ]);
  });

  it("the SAME pose without the чл. 103 flag measures and charges nothing", () => {
    // The half that keeps `sc-pe-school-patrol` byte-identical: its warden
    // holds the identical paddle pose, and driving past her is чл. 119's
    // offence — graded by the children on the zebra, not by this runner. Both
    // legs are asserted, because a flag that silenced the praise and not the
    // charge (or the reverse) would be worse than no flag.
    for (const [label, drive] of [
      ["ignored", (d: PolyDriver) => d.advance(DT, 11)],
      ["complied", (d: PolyDriver) => d.advance(DT, d.s >= 95 ? 0 : 9)],
    ] as const) {
      const stack = makeStack([wardenSpec()]);
      const path = offsetRight(edgeGeometry(), label === "ignored" ? LANE_OFFSET : LANE_OFFSET + 1.6);
      const driver = new PolyDriver(path, 20);
      for (let i = 0; i < 60 * 30 && stack.outcomes.length === 0; i++) {
        stepFrame(stack, drive(driver));
        if (driver.s >= driver.length) break;
      }
      expect(stack.outcomes, label).toHaveLength(1);
      expect(violationCodes(stack.ruleEvents), label).toEqual([]);
      expect(commendationCodes(stack.ruleEvents), label).toEqual([]);
      for (const tick of stack.ticks) {
        expect(tick.events.filter((e) => e.kind === "prioritySituation")).toEqual([]);
      }
    }
  });

  it("same seed + same driving = identical outcomes (deterministic staging)", () => {
    const runOnce = () => {
      const stack = makeStack([policeSpec()]);
      const pullOver = offsetRight(edgeGeometry(), LANE_OFFSET + 1.6);
      const driver = new PolyDriver(pullOver, 20);
      for (let i = 0; i < 60 * 30 && stack.outcomes.length === 0; i++) {
        const target = driver.s >= 95 ? 0 : 9;
        stepFrame(stack, driver.advance(DT, target));
      }
      return stack;
    };
    const a = runOnce();
    const b = runOnce();
    expect(a.outcomes).toEqual(b.outcomes);
    expect(violationCodes(a.ruleEvents)).toEqual(violationCodes(b.ruleEvents));
  });
});
