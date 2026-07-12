/**
 * A12 — the false-positive regression battery (doc 68, Pillar 3).
 *
 * False-positive penalties are the genre's #1 trust-killer (research R1 §6;
 * audit finding D10): one unfair flag and the student stops believing every
 * flag. This file is the CONTRACT that protects innocent driving: every case
 * below is a realistic, legal piece of driving that must produce ZERO
 * violations — commendations are welcome, penalties are forbidden.
 *
 * Rules of this file:
 *  - Each case names the innocent behaviour it protects in a comment.
 *  - When a case here fails, the DETECTOR is wrong (missing tolerance band),
 *    not the case — tune the config in types.ts and document the change.
 *  - Cases marked "regression:" locked in a specific A12 tolerance change and
 *    will fail again if that grace is ever removed.
 */

import { describe, expect, it } from "vitest";
import type { RuleEvent, SimTick, SimTickEvent } from "../types";
import { codes, cruise, drive, tick } from "./fixtures";

/** Assert the drive produced zero violations (commendations are fine). */
function expectInnocent(events: RuleEvent[]): void {
  const violations = events.filter((e) => e.kind === "violation").map((e) => `${e.code}@t=${e.t}`);
  expect(violations, `innocent driving must never be penalised, got: ${violations.join(", ")}`).toEqual(
    [],
  );
}

const glance = (mirror: "left" | "right" | "rear"): SimTickEvent => ({
  kind: "mirrorGlance",
  mirror,
});
const stopSign: SimTickEvent = { kind: "stopLineCrossed", control: "stopSign" };
const greenLight: SimTickEvent = {
  kind: "stopLineCrossed",
  control: "trafficLight",
  lightState: "green",
};
const zoneEntered = (ped: boolean, crossingId = "x1"): SimTickEvent => ({
  kind: "crossingZoneEntered",
  crossingId,
  pedestrianOnCrossing: ped,
});
const zonePassed = (ped: boolean, crossingId = "x1"): SimTickEvent => ({
  kind: "crossingPassed",
  crossingId,
  pedestrianOnCrossing: ped,
});

// ---------------------------------------------------------------------------
// Speeding
// ---------------------------------------------------------------------------

describe("FP battery — speeding", () => {
  it("cruising exactly AT the limit for minutes", () => {
    // Innocent: holding precisely 50 in a 50 zone is perfect driving, not a
    // near-miss — the limit is legal AT the limit.
    const { events } = drive(cruise(0, 180, { speedKmh: 50 }));
    expectInnocent(events);
  });

  it("cruising at the exact 10% grace boundary (55 @ 50)", () => {
    // Innocent: speedometer/physics noise territory — real enforcement
    // tolerances exist for the same reason.
    const { events } = drive(cruise(0, 30, { speedKmh: 55 }));
    expectInnocent(events);
  });

  it("momentary downhill overshoot corrected within the sustain window", () => {
    // Innocent: a short crest-and-correct (1.5 s a hair over the grace band)
    // that the driver fixes immediately.
    const { events } = drive([
      tick(0, { speedKmh: 56.5 }),
      tick(0.5, { speedKmh: 57.2 }),
      tick(1, { speedKmh: 56.1 }),
      tick(1.5, { speedKmh: 54 }),
      tick(2, { speedKmh: 50 }),
    ]);
    expectInnocent(events);
  });

  it("entering a lower-limit zone while already braking down to it", () => {
    // Innocent: crossing the 50 sign at 57 km/h mid-brake and being legal
    // within ~1 s — the driver responded before the sign, physics just takes
    // a moment.
    const { events } = drive([
      tick(0, { speedKmh: 88, maxSpeedKmh: 90 }),
      tick(1, { speedKmh: 87, maxSpeedKmh: 90 }),
      tick(2, { speedKmh: 57, maxSpeedKmh: 50 }),
      tick(2.5, { speedKmh: 53, maxSpeedKmh: 50 }),
      tick(3, { speedKmh: 49, maxSpeedKmh: 50 }),
      tick(4, { speedKmh: 48, maxSpeedKmh: 50 }),
    ]);
    expectInnocent(events);
  });
});

// ---------------------------------------------------------------------------
// Stop lines: Б2 stop sign & traffic lights
// ---------------------------------------------------------------------------

describe("FP battery — stop lines", () => {
  it("regression: full stop at Б2 with physics-solver creep (sub-1 km/h jitter)", () => {
    // Innocent: the car IS stopped on the brake; the rigid-body solver just
    // reports 0.3-0.9 km/h of residual creep. Locked in fullStopMaxSpeedKmh=1.
    const { events } = drive([
      tick(0, { speedKmh: 20 }),
      tick(1, { speedKmh: 6 }),
      tick(2, { speedKmh: 0.8 }),
      tick(2.5, { speedKmh: 0.4 }),
      tick(3, { speedKmh: 0.9 }),
      tick(3.5, { speedKmh: 0.6 }),
      tick(4, { speedKmh: 3 }),
      tick(5, { speedKmh: 8, events: [stopSign] }),
    ]);
    expectInnocent(events);
    expect(events.map((e) => e.code)).toContain("FULL_STOP_AT_STOP_SIGN");
  });

  it("two-stage Б2 stop: full stop at the line, then creep for sightline", () => {
    // Innocent: stop fully, then roll forward slowly to see past parked cars
    // before committing — exactly what instructors teach at blind corners.
    const { events } = drive([
      tick(0, { speedKmh: 15 }),
      tick(1, { speedKmh: 0.5 }),
      tick(1.5, { speedKmh: 0.3 }),
      tick(2, { speedKmh: 0.4 }),
      tick(3, { speedKmh: 4 }),
      tick(4, { speedKmh: 4 }),
      tick(5, { speedKmh: 4 }),
      tick(6, { speedKmh: 4, events: [stopSign] }),
    ]);
    expectInnocent(events);
    expect(events.map((e) => e.code)).toContain("FULL_STOP_AT_STOP_SIGN");
  });

  it("braking firmly-but-legally to a stop line at red (no crossing)", () => {
    // Innocent: a decisive ~4.5 m/s² stop before the line is good driving,
    // not an event — there is no harsh-braking violation and no line crossing.
    const { events } = drive([
      tick(0, { speedKmh: 50 }),
      tick(1, { speedKmh: 34 }),
      tick(2, { speedKmh: 18 }),
      tick(3, { speedKmh: 4 }),
      tick(4, { speedKmh: 0.5 }),
      tick(5, { speedKmh: 0.4 }),
    ]);
    expectInnocent(events);
  });

  it("legal stop at red, then proceeding on green", () => {
    // Innocent: the textbook traffic-light interaction end to end.
    const { events } = drive([
      tick(0, { speedKmh: 40 }),
      tick(1, { speedKmh: 10 }),
      tick(2, { speedKmh: 0.4 }),
      ...cruise(3, 20, { speedKmh: 0.3 }), // long red, waiting
      tick(21, { speedKmh: 8, events: [greenLight] }),
      tick(22, { speedKmh: 25 }),
    ]);
    expectInnocent(events);
  });

  it("green wave: crossing a signalised line at speed on green", () => {
    // Innocent: nobody stops for a green light.
    const { events } = drive([
      tick(0, { speedKmh: 45 }),
      tick(1, { speedKmh: 45, events: [greenLight] }),
      tick(2, { speedKmh: 45 }),
    ]);
    expectInnocent(events);
  });
});

// ---------------------------------------------------------------------------
// Indicators, mirrors & lane changes
// ---------------------------------------------------------------------------

describe("FP battery — indicators & lane changes", () => {
  it("brief indicator use during an in-lane correction (no lane change)", () => {
    // Innocent: blipping the indicator while nudging around debris inside the
    // lane — no laneId change, no turn, nothing to grade.
    const { events } = drive([
      tick(0, { speedKmh: 40, indicator: "right", laneOffsetM: 0.6 }),
      tick(1, { speedKmh: 40, indicator: "right", laneOffsetM: 0.4 }),
      tick(2, { speedKmh: 40, laneOffsetM: 0.1 }),
    ]);
    expectInnocent(events);
  });

  it("indicator held through a long red light before the turn", () => {
    // Innocent: signalling early and keeping the indicator on while queued is
    // exemplary — the lookback must key off the indicator being ON, not a
    // single stale activation timestamp.
    const { events } = drive([
      ...cruise(0, 20, { speedKmh: 0, indicator: "left" }),
      tick(21, { speedKmh: 15, indicator: "left", events: [{ kind: "turnStarted", direction: "left" }] }),
    ]);
    expectInnocent(events);
  });

  it("textbook lane change: mirror, signal, manoeuvre", () => {
    // Innocent: the full correct procedure earns praise, never a flag.
    const { events } = drive([
      tick(0, { speedKmh: 40, indicator: "left", events: [glance("left")] }),
      tick(1, { speedKmh: 40, indicator: "left", laneId: 1 }),
    ]);
    expectInnocent(events);
    expect(events.map((e) => e.code)).toContain("SAFE_LANE_CHANGE");
  });

  it("parking-speed lane-id shuffle (no real lane change)", () => {
    // Innocent: crawling across bay markings while positioning to park.
    const { events } = drive([
      tick(0, { speedKmh: 3 }),
      tick(1, { speedKmh: 3, laneId: 1 }),
      tick(2, { speedKmh: 3, laneId: 0 }),
    ]);
    expectInnocent(events);
  });

  it("regression: straight across an edge boundary that renumbers the lane (C1)", () => {
    // Innocent: driving straight from a 3-lane oneway (rightmost = laneId 0)
    // onto a narrower link renumbers the SAME physical lane — the SimTick
    // contract says lane ids are only stable along one segment. Found by the
    // C1 exam-bank bot: every boulevard→link joint billed a phantom
    // unsignalled + unmirrored lane change (2 × основна per joint). With the
    // tick's edgeId present, cross-segment deltas must never grade.
    const { events } = drive([
      tick(0, { speedKmh: 45, laneId: 1, laneCount: 3, edgeId: "e-blvd" }),
      tick(1, { speedKmh: 45, laneId: 1, laneCount: 3, edgeId: "e-blvd" }),
      tick(2, { speedKmh: 45, laneId: 0, laneCount: 1, edgeId: "e-link" }),
      tick(3, { speedKmh: 45, laneId: 0, laneCount: 1, edgeId: "e-link" }),
      // …and the renumbering back up onto the next multi-lane bank.
      tick(4, { speedKmh: 45, laneId: 2, laneCount: 3, edgeId: "e-blvd-2" }),
    ]);
    expectInnocent(events);
  });

  it("regression: cornering renumber just BEFORE the lock switches edges (C1)", () => {
    // Innocent: at a multi-lane joint the locator's projection sweeps the
    // outgoing bank while the car corners — the laneId flips a beat before
    // the edge lock switches. The joint grace must swallow the delta.
    const { events } = drive([
      ...cruise(0, 8, { speedKmh: 40, laneId: 0, laneCount: 3, edgeId: "e-blvd" }),
      tick(9, { speedKmh: 40, laneId: 1, laneCount: 3, edgeId: "e-blvd" }), // sweep artifact
      tick(10, { speedKmh: 40, laneId: 0, laneCount: 2, edgeId: "e-next" }), // lock switch
      ...cruise(11, 15, { speedKmh: 40, laneId: 0, laneCount: 2, edgeId: "e-next" }),
    ]);
    expectInnocent(events);
  });

  it("C1 guard-rail: a real lane change WITHIN one edge still grades", () => {
    // Guilty control for the joint cases: the same laneId delta inside one
    // segment, away from any joint, remains an unsignalled, unmirrored lane
    // change once the joint grace elapses — with the DELTA's own timestamp.
    const { events } = drive([
      ...cruise(0, 4, { speedKmh: 45, laneId: 0, laneCount: 3, edgeId: "e-blvd" }),
      tick(5, { speedKmh: 45, laneId: 1, laneCount: 3, edgeId: "e-blvd" }),
      ...cruise(6, 10, { speedKmh: 45, laneId: 1, laneCount: 3, edgeId: "e-blvd" }),
    ]);
    expect(codes(events)).toContain("LANE_CHANGE_WITHOUT_INDICATOR");
    expect(codes(events)).toContain("LANE_CHANGE_WITHOUT_MIRROR_CHECK");
    const v = events.find((e) => e.code === "LANE_CHANGE_WITHOUT_INDICATOR");
    expect(v?.t).toBe(5);
  });

  it("regression: brisk reverse across a lane boundary during a reverse park", () => {
    // Innocent: backing across the lane line at 11 km/h while manoeuvring
    // into a spot is a parking move, not an unsignalled lane change.
    // Locked in the reverse-gear gate on lane-change detection.
    const { events } = drive([
      tick(0, { speedKmh: 11, gear: -1, laneId: 1 }),
      tick(1, { speedKmh: 11, gear: -1, laneId: 0 }),
      tick(2, { speedKmh: 6, gear: -1, laneId: 0 }),
    ]);
    expectInnocent(events);
  });
});

// ---------------------------------------------------------------------------
// Seatbelt, handbrake, headlights
// ---------------------------------------------------------------------------

describe("FP battery — belt, handbrake, lights", () => {
  it("handbrake on at spawn, released before pulling away", () => {
    // Innocent: every drive starts exactly like this.
    const { events } = drive([
      tick(0, { speedKmh: 0, handbrakeOn: true }),
      tick(1, { speedKmh: 0, handbrakeOn: true }),
      tick(2, { speedKmh: 0, handbrakeOn: false }),
      tick(3, { speedKmh: 10 }),
      tick(4, { speedKmh: 25 }),
    ]);
    expectInnocent(events);
  });

  it("hill start: handbrake eased off within a second of rolling", () => {
    // Innocent: the taught hill-start technique briefly overlaps handbrake
    // and motion — the 1.5 s sustain window exists exactly for this.
    const { events } = drive([
      tick(0, { speedKmh: 0, handbrakeOn: true }),
      tick(0.5, { speedKmh: 2, handbrakeOn: true }),
      tick(1, { speedKmh: 6, handbrakeOn: true }),
      tick(1.5, { speedKmh: 9, handbrakeOn: false }),
      tick(2.5, { speedKmh: 18 }),
    ]);
    expectInnocent(events);
  });

  it("belt clicked on before moving off (off only while parked)", () => {
    // Innocent: being unbelted while stationary at spawn is the normal state
    // of getting into a car.
    const { events } = drive([
      tick(0, { speedKmh: 0, seatbeltOn: false }),
      tick(1, { speedKmh: 0, seatbeltOn: false }),
      tick(2, { speedKmh: 0, seatbeltOn: true }),
      tick(3, { speedKmh: 15 }),
    ]);
    expectInnocent(events);
  });

  it("night driving with low beams on, start to finish", () => {
    // Innocent: lows on at night is THE correct configuration.
    const { events } = drive(cruise(0, 60, { speedKmh: 45, isNight: true, headlights: "low" }));
    expectInnocent(events);
  });

  it("night driving on high beams (open road) is not 'lights off'", () => {
    // Innocent: high beam correctness is a separate future rule; the
    // lights-off detector must only fire for OFF.
    const { events } = drive(cruise(0, 15, { speedKmh: 45, isNight: true, headlights: "high" }));
    expectInnocent(events);
  });
});

// ---------------------------------------------------------------------------
// Conditions: rain & night prudent-speed, lights in rain
// ---------------------------------------------------------------------------

describe("FP battery — rain & night conditions", () => {
  it("rain at a conditions-appropriate speed (40 @ 50), lows on", () => {
    // Innocent: 20% under the limit in rain is textbook prudence (ЗДвП чл. 20).
    const { events } = drive(cruise(0, 60, { speedKmh: 40, rain: true, headlights: "low" }));
    expectInnocent(events);
  });

  it("regression: night cruise at exactly the limit with lows on", () => {
    // Innocent: on lit urban streets EVERY competent driver does 50 in a 50
    // at night. Locked in conditionSpeedNightFactor = 1 — the old 0.9 factor
    // flagged this exact drive after 3 s.
    const { events } = drive(
      cruise(0, 120, { speedKmh: 50, isNight: true, headlights: "low" }),
    );
    expectInnocent(events);
  });

  it("regression: rainy night at 40 @ 50 — factors must not multiply", () => {
    // Innocent: 40 in a 50 on a rainy night is prudent. The old product
    // composition (0.85 x 0.9 = 38.25 km/h ceiling) double-billed the same
    // caution. Locked in MIN composition of condition factors.
    const { events } = drive(
      cruise(0, 60, { speedKmh: 40, rain: true, isNight: true, headlights: "low" }),
    );
    expectInnocent(events);
  });

  it("brief seconds near the limit in rain, corrected before the sustain", () => {
    // Innocent: drifting to 44 for two seconds and easing back off is
    // ordinary speed management, not imprudence.
    const { events } = drive([
      tick(0, { speedKmh: 44, rain: true, headlights: "low" }),
      tick(1, { speedKmh: 44, rain: true, headlights: "low" }),
      tick(2, { speedKmh: 40, rain: true, headlights: "low" }),
      tick(3, { speedKmh: 40, rain: true, headlights: "low" }),
    ]);
    expectInnocent(events);
  });
});

// ---------------------------------------------------------------------------
// Following distance
// ---------------------------------------------------------------------------

describe("FP battery — following distance", () => {
  it("holding exactly the 1.8 s safe gap at 50 km/h", () => {
    // Innocent: driving at precisely the taught gap must never flag —
    // boundary conditions belong to the driver.
    const safeGap = (50 / 3.6) * 1.8; // = 25 m
    const { events } = drive(cruise(0, 12, { speedKmh: 50, leadGapM: safeGap }));
    expectInnocent(events);
  });

  it("regression: queue rolling at 18 km/h with a short queue gap", () => {
    // Innocent: dense stop-and-go traffic rolls at 15-20 km/h a car-length
    // apart — flagging it spams the exact FP that killed trust in
    // competitor sims. Locked in followMinSpeedKmh = 20.
    const { events } = drive(cruise(0, 8, { speedKmh: 18, leadGapM: 5 }));
    expectInnocent(events);
  });

  it("stop-and-go crawl: alternating 0 and 12 km/h bumper to bumper", () => {
    // Innocent: creeping in a jam with 4 m to the car ahead.
    const ticks: SimTick[] = [];
    for (let t = 0; t <= 20; t += 1) {
      ticks.push(tick(t, { speedKmh: t % 2 === 0 ? 0 : 12, leadGapM: t % 2 === 0 ? 4 : 6 }));
    }
    const { events } = drive(ticks);
    expectInnocent(events);
  });

  it("regression: normal urban flow slightly inside the 2-second ideal", () => {
    // Innocent: an ~1.3 s gap at 30 km/h is how city traffic actually moves;
    // no examiner faults it. Locked in followFireRatio = 0.7 — grading at
    // 100% of the taught ideal flagged this.
    const { events } = drive(cruise(0, 10, { speedKmh: 30, leadGapM: 11 }));
    expectInnocent(events);
  });

  it("regression: a car cuts in close and the driver backs off (gap opening)", () => {
    // Innocent: someone merged 8 m ahead at 40 km/h — through no fault of
    // the driver, who is visibly re-opening the gap. Locked in
    // followRecoveryRateMps: recovering frames never count as tailgating.
    const { events } = drive([
      tick(0, { speedKmh: 40, leadGapM: 22 }),
      tick(1, { speedKmh: 40, leadGapM: 8 }), // the cut-in
      tick(2, { speedKmh: 38, leadGapM: 9.5 }),
      tick(3, { speedKmh: 37, leadGapM: 11 }),
      tick(4, { speedKmh: 36, leadGapM: 12.5 }),
      tick(5, { speedKmh: 36, leadGapM: 14 }),
      tick(6, { speedKmh: 36, leadGapM: 16 }),
    ]);
    expectInnocent(events);
  });

  it("clear road reported as an infinite gap", () => {
    // Innocent: a sensor channel that reports Infinity for 'nobody ahead'
    // must read as a clear road, not as a number to compare.
    const { events } = drive(cruise(0, 10, { speedKmh: 50, leadGapM: Number.POSITIVE_INFINITY }));
    expectInnocent(events);
  });
});

// ---------------------------------------------------------------------------
// Lane keeping, keep right, wrong way
// ---------------------------------------------------------------------------

describe("FP battery — lane keeping & lane discipline", () => {
  it("correctly hugging the right edge of the 8.125 m perceptual lane", () => {
    // Innocent: ЗДвП чл. 15 says keep as far right as practicable — on the
    // 2.5x-scaled drawn lane that puts you ~2.6 m right of the centreline,
    // which must stay comfortably inside the 3.25 m straddle threshold.
    const { events } = drive(cruise(0, 20, { speedKmh: 40, laneOffsetM: -2.6 }));
    expectInnocent(events);
  });

  it("sensor-noise lane-offset jitter around centre (±0.4 m)", () => {
    // Innocent: lane-fix estimation wobbles; noise is not weaving.
    const offsets = [0.3, -0.4, 0.2, -0.3, 0.4, -0.2, 0.1, -0.4, 0.3, 0];
    const { events } = drive(offsets.map((o, t) => tick(t, { speedKmh: 50, laneOffsetM: o })));
    expectInnocent(events);
  });

  it("brief avoidance swerve around an obstacle, re-centred within the sustain", () => {
    // Innocent: two seconds wide of the lane centre to clear a parked car's
    // door zone, then straight back.
    const { events } = drive([
      tick(0, { speedKmh: 35, laneOffsetM: 0.2 }),
      tick(1, { speedKmh: 33, laneOffsetM: 3.6 }),
      tick(2, { speedKmh: 33, laneOffsetM: 3.6 }),
      tick(3, { speedKmh: 35, laneOffsetM: 0.3 }),
      tick(4, { speedKmh: 35, laneOffsetM: 0.1 }),
    ]);
    expectInnocent(events);
  });

  it("regression: a complete ~10 s overtake in the left lane", () => {
    // Innocent: mirror-signal-move out, pass a slower vehicle for ~10 s,
    // signal and return. Locked in keepRightSustainSec = 12 (was 8, which
    // fired mid-pass) plus the left-indicator exemption.
    const { events } = drive([
      tick(0, { speedKmh: 40, laneCount: 2, events: [glance("left")], indicator: "left" }),
      tick(1, { speedKmh: 40, laneCount: 2, indicator: "left" }),
      tick(2, { speedKmh: 42, laneCount: 2, indicator: "left", laneId: 1 }),
      ...cruise(3, 11, { speedKmh: 50, laneCount: 2, laneId: 1 }),
      tick(12, { speedKmh: 48, laneCount: 2, laneId: 1, indicator: "right", events: [glance("right")] }),
      tick(13, { speedKmh: 45, laneCount: 2, laneId: 0, indicator: "right" }),
      tick(14, { speedKmh: 45, laneCount: 2, laneId: 0 }),
    ]);
    expectInnocent(events);
  });

  it("regression: left-lane positioning with the left indicator before a left turn", () => {
    // Innocent: чл. 25 REQUIRES taking the left lane ahead of a left turn;
    // with the indicator declaring the intent this can last well beyond any
    // sustain window. Locked in the indicator-left exemption on keep-right.
    const { events } = drive([
      ...cruise(0, 20, { speedKmh: 30, laneId: 1, laneCount: 2, indicator: "left" }),
      tick(21, {
        speedKmh: 15,
        laneId: 1,
        laneCount: 2,
        indicator: "left",
        events: [{ kind: "turnStarted", direction: "left" }],
      }),
    ]);
    expectInnocent(events);
  });

  it("regression: reverse parallel park against a one-way's flow", () => {
    // Innocent: reversing into a spot moves against the flow BY DEFINITION —
    // the runtime's wrongWay flag must not read as wrong-way driving while
    // in reverse gear. Locked in the reverse-gear gate (WRONG_WAY is 10 pts;
    // this would be the worst possible FP mid-parking-lesson).
    const { events } = drive([
      tick(0, { speedKmh: 6, gear: -1, wrongWay: true }),
      tick(1, { speedKmh: 6, gear: -1, wrongWay: true }),
      tick(2, { speedKmh: 5.5, gear: -1, wrongWay: true }),
      tick(3, { speedKmh: 4, gear: -1, wrongWay: true }),
      tick(4, { speedKmh: 2, gear: -1, wrongWay: false }),
    ]);
    expectInnocent(events);
  });

  it("regression: reverse bay park — off-centre and 'in the left lane' while backing", () => {
    // Innocent: a bay entry sweeps the car across lane geometry for many
    // seconds. Locked in the reverse-gear gates on lane-keeping and
    // keep-right.
    const { events } = drive(
      Array.from({ length: 16 }, (_, t) =>
        tick(t, { speedKmh: 6, gear: -1, laneOffsetM: 4.5, laneId: 1, laneCount: 2 }),
      ),
    );
    expectInnocent(events);
  });
});

// ---------------------------------------------------------------------------
// Pedestrian crossings & priority
// ---------------------------------------------------------------------------

describe("FP battery — pedestrian crossings & priority", () => {
  it("regression: prompt firm brake from a legal approach speed for a pedestrian", () => {
    // Innocent: entering the ~25-30 m zone at a legal 45 and braking at
    // ~3 m/s² to a stop — the exact correct response. Physically it takes
    // >1 s to get under 30 km/h, so without the braking-response band the
    // 10-point too-fast flag fired DURING the correct reaction. Locked in
    // crossingBrakeResponseMps2.
    const { events } = drive([
      tick(0, { speedKmh: 45 }),
      tick(1, { speedKmh: 45, events: [zoneEntered(true)] }),
      tick(1.5, { speedKmh: 41 }),
      tick(2, { speedKmh: 36 }),
      tick(2.5, { speedKmh: 31 }),
      tick(3, { speedKmh: 25 }),
      tick(3.5, { speedKmh: 18 }),
      tick(4, { speedKmh: 10 }),
      tick(4.5, { speedKmh: 4 }),
      tick(5.5, { speedKmh: 4 }),
      tick(6.5, { speedKmh: 12, events: [zonePassed(false)] }),
    ]);
    expectInnocent(events);
    expect(events.map((e) => e.code)).toContain("PEDESTRIAN_YIELDED");
  });

  it("slowing for a pedestrian who clears — no full stop where none is required", () => {
    // Innocent: the law requires yielding, not stopping, when the pedestrian
    // has already left your path.
    const { events } = drive([
      tick(0, { speedKmh: 28, events: [zoneEntered(true)] }),
      tick(1, { speedKmh: 22 }),
      tick(2, { speedKmh: 16 }),
      tick(3, { speedKmh: 15, events: [zonePassed(false)] }),
      tick(4, { speedKmh: 25 }),
    ]);
    expectInnocent(events);
  });

  it("passing an empty crossing at normal urban speed", () => {
    // Innocent: no pedestrian, no reduction duty beyond the posted limit.
    const { events } = drive([
      tick(0, { speedKmh: 45, events: [zoneEntered(false)] }),
      tick(1, { speedKmh: 45 }),
      tick(2, { speedKmh: 45, events: [zonePassed(false)] }),
    ]);
    expectInnocent(events);
  });

  it("crossing a give-way junction with no conflicting traffic", () => {
    // Innocent: 'give way' means yield to traffic that exists — proceeding
    // across an empty junction is correct, not a lucky escape.
    const { events } = drive([
      tick(0, {
        speedKmh: 25,
        events: [{ kind: "prioritySituation", situation: "give-way", violated: false }],
      }),
      tick(1, { speedKmh: 30 }),
    ]);
    expectInnocent(events);
  });

  it("right-hand-rule junction entry with the right clear", () => {
    // Innocent: no vehicle from the right, no duty to stop.
    const { events } = drive([
      tick(0, {
        speedKmh: 25,
        events: [{ kind: "prioritySituation", situation: "rightHandRule", violated: false }],
      }),
      tick(1, { speedKmh: 30 }),
    ]);
    expectInnocent(events);
  });
});

// ---------------------------------------------------------------------------
// B1a Wave-1 detector pack (doc 72 capability 1 + N2) — every new code ships
// with its innocent-driving cases HERE, before anything else (the mission's
// own law). Context fields (nextStopLine*, oneway, stalled…) are OPTIONAL:
// their absence must always read as innocent, and their presence must only
// convict the specific guilty pattern.
// ---------------------------------------------------------------------------

describe("FP battery — stall grading (ENGINE_STALLED)", () => {
  it("legacy rig without a stall channel drives a whole route", () => {
    // Innocent: `stalled` absent (automatic fleet / older callers) must never
    // read as a stall.
    const { events } = drive(cruise(0, 60, { speedKmh: 45 }));
    expectInnocent(events);
  });

  it("clean manual drive with the stall channel present and false throughout", () => {
    // Innocent: the channel exists and stays false — including during slow
    // maneuvering where a stall would be most likely.
    const { events } = drive([
      tick(0, { speedKmh: 0, stalled: false }),
      tick(1, { speedKmh: 4, stalled: false }),
      tick(2, { speedKmh: 15, stalled: false }),
      ...cruise(3, 30, { speedKmh: 40, stalled: false }),
    ]);
    expectInnocent(events);
  });

  it("engine deliberately switched off at the destination", () => {
    // Innocent: a normal ignition-off at rest does NOT latch `stalled` (the
    // driveline only sets it on a stall) — parking must stay penalty-free.
    const { events } = drive([
      tick(0, { speedKmh: 12, stalled: false }),
      tick(1, { speedKmh: 3, stalled: false }),
      tick(2, { speedKmh: 0, stalled: false }),
      ...cruise(3, 10, { speedKmh: 0, stalled: false, gear: 0, handbrakeOn: true }),
    ]);
    expectInnocent(events);
  });
});

describe("FP battery — move-off observation (enabled per-lesson)", () => {
  // The detector ships config-OFF (see types.ts); these cases prove the
  // ENABLED mode safe for every innocent move-off shape.
  const enabled = { moveOffObservationEnabled: true } as const;

  it("mirror checked two seconds before pulling away", () => {
    // Innocent: the taught ritual — glance left, then go.
    const { events } = drive(
      [
        tick(0, { speedKmh: 0 }),
        tick(1, { speedKmh: 0, events: [glance("left")] }),
        tick(3, { speedKmh: 8 }),
        tick(4, { speedKmh: 20 }),
      ],
      enabled,
    );
    expectInnocent(events);
  });

  it("interior (rear) mirror check before moving off", () => {
    // Innocent: checking behind through the rear-view counts as observation.
    const { events } = drive(
      [
        tick(0, { speedKmh: 0 }),
        tick(2, { speedKmh: 0, events: [glance("rear")] }),
        tick(3, { speedKmh: 10 }),
      ],
      enabled,
    );
    expectInnocent(events);
  });

  it("first motion is a reverse bay exit (maneuver domain, not a move-off)", () => {
    // Innocent: reversing out of a bay is judged by maneuver objectives; the
    // forward-move-off rule must not claim it.
    const { events } = drive(
      [
        tick(0, { speedKmh: 0, gear: -1 }),
        tick(1, { speedKmh: 7, gear: -1 }),
        tick(2, { speedKmh: 7, gear: -1 }),
        tick(3, { speedKmh: 0, gear: 1 }),
        tick(4, { speedKmh: 12 }),
      ],
      enabled,
    );
    expectInnocent(events);
  });

  it("session that begins already in motion is never graded", () => {
    // Innocent: no observed rest = no move-off to judge (mid-drive handoff).
    const { events } = drive(
      [tick(0, { speedKmh: 40 }), tick(1, { speedKmh: 40 }), tick(2, { speedKmh: 40 })],
      enabled,
    );
    expectInnocent(events);
  });
});

describe("FP battery — stop position at red (STOP_LINE_OVERSHOOT)", () => {
  const atLine = (over: Partial<SimTick>): Partial<SimTick> => ({
    speedKmh: 0.5,
    nextStopLineControl: "trafficLight" as const,
    ...over,
  });

  it("textbook stop 2.5 m before the line at red", () => {
    // Innocent: stopping short of the paint is the correct position — only a
    // nose clearly OVER the line may grade.
    const { events } = drive([
      tick(0, { speedKmh: 20, nextStopLineM: 30, nextStopLineControl: "trafficLight", nextStopLineState: "red" }),
      ...cruise(1, 20, atLine({ nextStopLineM: 2.5, nextStopLineState: "red" })),
    ]);
    expectInnocent(events);
  });

  it("queue creep close to the line while the light is green", () => {
    // Innocent: rolling up tight to the line on green behind the queue is
    // normal — only red/red+yellow arms the overshoot rule (and the car
    // ahead exempts the hesitation rule).
    const { events } = drive([
      ...cruise(0, 10, atLine({ nextStopLineM: 0.8, nextStopLineState: "green", leadGapM: 6 })),
    ]);
    expectInnocent(events);
  });

  it("Б2 creep-and-peek: stop sign, nose at the paint for sightline", () => {
    // Innocent: the two-stage stop-sign technique (full stop, then creep to
    // see past parked cars) must stay protected — the rule is red-light only.
    const { events } = drive([
      tick(0, { speedKmh: 15 }),
      tick(1, { speedKmh: 0.4, nextStopLineM: 3, nextStopLineControl: "stopSign" }),
      ...cruise(2, 8, { speedKmh: 0.5, nextStopLineM: 0.5, nextStopLineControl: "stopSign" }),
    ]);
    expectInnocent(events);
  });

  it("cruising with a red light still far ahead", () => {
    // Innocent: distance context alone (moving, line 40 m out) is not a stop.
    const { events } = drive(
      cruise(0, 10, {
        speedKmh: 30,
        nextStopLineM: 40,
        nextStopLineControl: "trafficLight",
        nextStopLineState: "red",
      }),
    );
    expectInnocent(events);
  });

  it("regression: green-queue creep to the line, light flips red while standing", () => {
    // Innocent: rolled up tight to the line ON GREEN behind a queue (lawful
    // entry), then the phase cycles to red over the stranded car. The code
    // charges HOW YOU ARRIVED, not where a red caught you. Locked in the C3
    // lawful-presence latch (stopOvershootGreenSeen).
    const { events } = drive([
      tick(0, { speedKmh: 12, nextStopLineM: 12, nextStopLineControl: "trafficLight", nextStopLineState: "green", leadGapM: 8 }),
      tick(1, { speedKmh: 6, nextStopLineM: 6, nextStopLineControl: "trafficLight", nextStopLineState: "green", leadGapM: 6 }),
      tick(2, { speedKmh: 3, nextStopLineM: 2, nextStopLineControl: "trafficLight", nextStopLineState: "green", leadGapM: 5 }),
      tick(3, { speedKmh: 0.5, nextStopLineM: 0.8, nextStopLineControl: "trafficLight", nextStopLineState: "green", leadGapM: 5 }),
      ...cruise(4, 10, { speedKmh: 0.4, nextStopLineM: 0.8, nextStopLineControl: "trafficLight", nextStopLineState: "red", leadGapM: 5 }),
    ]);
    expectInnocent(events);
  });
});

describe("FP battery — center line (CENTER_LINE_TOUCHED)", () => {
  it("signalled pass around a double-parked van on a two-way street", () => {
    // Innocent: a DECLARED excursion over the center (indicator on) is a
    // maneuver, not line-riding — чл. 25 discipline, exempt by design.
    const { events } = drive([
      tick(0, { speedKmh: 35, oneway: false, laneCount: 1, laneId: 0, indicator: "left", laneOffsetM: 0.4 }),
      tick(1, { speedKmh: 33, oneway: false, laneCount: 1, laneId: 0, indicator: "left", laneOffsetM: 3.6 }),
      tick(2, { speedKmh: 33, oneway: false, laneCount: 1, laneId: 0, indicator: "left", laneOffsetM: 3.6 }),
      tick(3, { speedKmh: 33, oneway: false, laneCount: 1, laneId: 0, indicator: "right", laneOffsetM: 3.5 }),
      tick(4, { speedKmh: 35, oneway: false, laneCount: 1, laneId: 0, laneOffsetM: 0.3 }),
    ]);
    expectInnocent(events);
  });

  it("brief unsignalled clip of the line through a bend, corrected", () => {
    // Innocent: a 1.5 s brush against the line that the driver fixes is lane
    // keeping noise, not sustained line-riding (sustain window).
    const { events } = drive([
      tick(0, { speedKmh: 40, oneway: false, laneCount: 1, laneId: 0, laneOffsetM: 3.4 }),
      tick(1.5, { speedKmh: 40, oneway: false, laneCount: 1, laneId: 0, laneOffsetM: 0.4 }),
      tick(3, { speedKmh: 40, oneway: false, laneCount: 1, laneId: 0, laneOffsetM: 0.2 }),
    ]);
    expectInnocent(events);
  });

  it("left-edge drift on a ONE-WAY street is not a center-line touch", () => {
    // Innocent (of this code): a one-way's left edge borders no oncoming
    // traffic — the specific осева-линия charge must never apply there.
    const { events } = drive([
      tick(0, { speedKmh: 40, oneway: true, laneCount: 2, laneId: 1, laneOffsetM: 3.5 }),
      tick(1, { speedKmh: 40, oneway: true, laneCount: 2, laneId: 1, laneOffsetM: 3.5 }),
      tick(2.5, { speedKmh: 40, oneway: true, laneCount: 2, laneId: 1, laneOffsetM: 0.3 }),
    ]);
    expectInnocent(events);
  });

  it("reverse parallel park sweeping across the center of a two-way", () => {
    // Innocent: reverse maneuvering legitimately crosses lane geometry.
    const { events } = drive(
      Array.from({ length: 6 }, (_, t) =>
        tick(t, { speedKmh: 6, gear: -1, oneway: false, laneCount: 1, laneId: 0, laneOffsetM: 4.2 }),
      ),
    );
    expectInnocent(events);
  });

  it("regression: unsignalled ~3 s pass around a parked car blocking the lane", () => {
    // Innocent: a delivery van blocks the lane; the driver eases over the
    // center and back in one ~3 s arc. On streets lined with parked cars the
    // usable corridor IS at/over the nominal center — a single avoidance arc
    // is not line-riding. Locked in centerLineSustainSec = 3.5 (was 2, which
    // fired mid-avoidance). The lazy block-long straddle still fires (see
    // wave1-detectors.test.ts). C3 ruling: a LONG unsignalled occupation
    // stays guilty — чл. 25 wants заобикаляне signalled; the sustain window
    // only shields the brief arc.
    const { events } = drive([
      tick(0, { speedKmh: 30, oneway: false, laneCount: 1, laneId: 0, laneOffsetM: 0.3 }),
      tick(1, { speedKmh: 28, oneway: false, laneCount: 1, laneId: 0, laneOffsetM: 3.5 }),
      tick(2, { speedKmh: 28, oneway: false, laneCount: 1, laneId: 0, laneOffsetM: 3.6 }),
      tick(3, { speedKmh: 28, oneway: false, laneCount: 1, laneId: 0, laneOffsetM: 3.5 }),
      tick(4, { speedKmh: 30, oneway: false, laneCount: 1, laneId: 0, laneOffsetM: 0.4 }),
      tick(5, { speedKmh: 32, oneway: false, laneCount: 1, laneId: 0, laneOffsetM: 0.2 }),
    ]);
    expectInnocent(events);
  });
});

describe("FP battery — causeless harsh brake (HARSH_BRAKING_NO_CAUSE)", () => {
  it("emergency stop for a pedestrian dart-out at a crossing", () => {
    // Innocent: THE correct emergency response — the armed crossing zone is
    // the cause; grading it would punish exactly the trained reflex.
    const { events } = drive([
      tick(0, { speedKmh: 45 }),
      tick(0.5, { speedKmh: 45, events: [zoneEntered(true)] }),
      tick(1, { speedKmh: 31 }),
      tick(1.5, { speedKmh: 17 }),
      tick(2, { speedKmh: 4 }),
      tick(3, { speedKmh: 0.5 }),
    ]);
    expectInnocent(events);
  });

  it("hard stop behind a brake-slamming lead car", () => {
    // Innocent: the lead vehicle IS the cause (leadGapM present and shrinking,
    // then reopening as the driver stops harder).
    const { events } = drive([
      tick(0, { speedKmh: 55, leadGapM: 30 }),
      tick(1, { speedKmh: 36, leadGapM: 14 }),
      tick(1.5, { speedKmh: 22, leadGapM: 15.5 }),
      tick(2, { speedKmh: 8, leadGapM: 18 }),
      tick(3, { speedKmh: 0.5, leadGapM: 19 }),
    ]);
    expectInnocent(events);
  });

  it("late-but-legal hard stop for a red light ahead", () => {
    // Innocent: a red light within the clear window is a cause — the amber
    // dilemma's stop branch must never grade as phantom braking.
    const { events } = drive([
      tick(0, { speedKmh: 50, nextStopLineM: 45, nextStopLineControl: "trafficLight", nextStopLineState: "yellow" }),
      tick(0.5, { speedKmh: 36, nextStopLineM: 39, nextStopLineControl: "trafficLight", nextStopLineState: "red" }),
      tick(1, { speedKmh: 22, nextStopLineM: 35, nextStopLineControl: "trafficLight", nextStopLineState: "red" }),
      tick(1.5, { speedKmh: 8, nextStopLineM: 33, nextStopLineControl: "trafficLight", nextStopLineState: "red" }),
      tick(2.5, { speedKmh: 0.5, nextStopLineM: 32, nextStopLineControl: "trafficLight", nextStopLineState: "red" }),
    ]);
    expectInnocent(events);
  });

  it("firm planned stop at ~4.5 m/s² on a clear road", () => {
    // Innocent: decisive braking is good driving; only emergency-grade decel
    // with zero context may grade.
    const { events } = drive([
      tick(0, { speedKmh: 50 }),
      tick(1, { speedKmh: 34 }),
      tick(2, { speedKmh: 18 }),
      tick(3, { speedKmh: 4 }),
      tick(4, { speedKmh: 0.5 }),
    ]);
    expectInnocent(events);
  });

  it("hard brake on a junction approach (car noses out and retreats)", () => {
    // Innocent: junction proximity is a plausible cause by definition —
    // ERSO says 40–60% of crashes happen there; the gate stays wide.
    const { events } = drive([
      tick(0, { speedKmh: 48, nextJunctionM: 34 }),
      tick(0.5, { speedKmh: 34, nextJunctionM: 30 }),
      tick(1, { speedKmh: 20, nextJunctionM: 27 }),
      tick(2, { speedKmh: 30, nextJunctionM: 15 }),
    ]);
    expectInnocent(events);
  });

  it("regression: amber flip at 70 m + lead braking 50 m ahead — causes just outside the old gates", () => {
    // Innocent: the light flips to yellow 70 m out (beyond the 60 m stop-line
    // gate) AND the lead brakes from 50 m (beyond the 45 m lead gate); the
    // student responds to both with an emergency-grade stop. Two near-causes,
    // each a hair outside its window, are still an obvious cause. Locked in
    // harshBrakeSignalCauseM (any visible non-green light is a cause) and
    // harshBrakeClosingLeadMps (a fast-closing lead is a cause at any range).
    const { events } = drive([
      tick(0, { speedKmh: 55, leadGapM: 52, nextStopLineM: 74, nextStopLineControl: "trafficLight", nextStopLineState: "green" }),
      tick(0.5, { speedKmh: 55, leadGapM: 50, nextStopLineM: 70, nextStopLineControl: "trafficLight", nextStopLineState: "yellow" }),
      tick(1, { speedKmh: 41, leadGapM: 49, nextStopLineM: 66, nextStopLineControl: "trafficLight", nextStopLineState: "yellow" }),
      tick(1.5, { speedKmh: 27, leadGapM: 49.5, nextStopLineM: 62, nextStopLineControl: "trafficLight", nextStopLineState: "yellow" }),
      tick(2, { speedKmh: 14, leadGapM: 51, nextStopLineM: 60, nextStopLineControl: "trafficLight", nextStopLineState: "red" }),
      tick(3, { speedKmh: 0.5, leadGapM: 53, nextStopLineM: 59, nextStopLineControl: "trafficLight", nextStopLineState: "red" }),
    ]);
    expectInnocent(events);
  });

  it("regression: lead brake-checks then accelerates away mid-stop (sticky cause)", () => {
    // Innocent: the lead slams (gap collapses 30→14 — a plain cause), the
    // student commits to a hard stop, the lead floors it and the gap balloons
    // past the clear gate WHILE the stop is still finishing. A cause observed
    // during one continuous braking episode exempts the whole episode.
    // Locked in the harshBrake.causeSeen sticky-cause ledger.
    const { events } = drive([
      tick(0, { speedKmh: 55, leadGapM: 30 }),
      tick(0.5, { speedKmh: 48, leadGapM: 20 }),
      tick(1, { speedKmh: 36, leadGapM: 14 }),
      tick(1.5, { speedKmh: 22, leadGapM: 30 }),
      tick(2, { speedKmh: 9, leadGapM: 48 }),
      tick(2.5, { speedKmh: 0.5, leadGapM: 60 }),
    ]);
    expectInnocent(events);
  });
});

describe("FP battery — hesitation at green (HESITATION_AT_GREEN)", () => {
  const light = (over: Partial<SimTick>): Partial<SimTick> => ({
    speedKmh: 0.4,
    nextStopLineM: 6,
    nextStopLineControl: "trafficLight" as const,
    ...over,
  });

  it("long wait at RED is patience, not hesitation", () => {
    const { events } = drive(cruise(0, 35, light({ nextStopLineState: "red" })));
    expectInnocent(events);
  });

  it("green with a queue still blocking the box", () => {
    // Innocent: green means go-if-clear; a car 5 m ahead is not clear.
    const { events } = drive(cruise(0, 20, light({ nextStopLineState: "green", leadGapM: 5 })));
    expectInnocent(events);
  });

  it("green while waiting for an oncoming gap with the left indicator on", () => {
    // Innocent: a declared left turn lawfully waits at green (чл. 25/чл. 37).
    const { events } = drive(
      cruise(0, 25, light({ nextStopLineState: "green", indicator: "left" })),
    );
    expectInnocent(events);
  });

  it("prompt move-off within three seconds of green", () => {
    const { events } = drive([
      ...cruise(0, 10, light({ nextStopLineState: "red" })),
      tick(11, light({ nextStopLineState: "green" })),
      tick(12, light({ nextStopLineState: "green" })),
      tick(13, { speedKmh: 9, nextStopLineM: 2, nextStopLineControl: "trafficLight", nextStopLineState: "green" }),
      tick(14, { speedKmh: 20 }),
    ]);
    expectInnocent(events);
  });
});

describe("FP battery — amber & red+yellow signal semantics", () => {
  it("yellow crossing inside the dilemma zone (stop was NOT comfortably possible)", () => {
    // Innocent: this is exactly what the yellow phase legally exists for.
    const { events } = drive([
      tick(0, { speedKmh: 48 }),
      tick(1, {
        speedKmh: 48,
        events: [{ kind: "stopLineCrossed", control: "trafficLight", lightState: "yellow", stoppable: false }],
      }),
      tick(2, { speedKmh: 45 }),
    ]);
    expectInnocent(events);
  });

  it("yellow crossing with no amber adjudication attached (legacy engine)", () => {
    // Innocent: unknown = innocent — a runtime that cannot compute the flip
    // snapshot must never convict on yellow (A12).
    const { events } = drive([
      tick(0, { speedKmh: 40 }),
      tick(1, {
        speedKmh: 40,
        events: [{ kind: "stopLineCrossed", control: "trafficLight", lightState: "yellow" }],
      }),
    ]);
    expectInnocent(events);
  });

  it("waiting through red+yellow and crossing on clean green", () => {
    // Innocent: the textbook red → red+yellow → green launch.
    const { events } = drive([
      ...cruise(0, 8, { speedKmh: 0.4, nextStopLineM: 4, nextStopLineControl: "trafficLight", nextStopLineState: "red" }),
      tick(9, { speedKmh: 0.4, nextStopLineM: 4, nextStopLineControl: "trafficLight", nextStopLineState: "redYellow" }),
      tick(10, { speedKmh: 6, events: [greenLight] }),
      tick(11, { speedKmh: 18 }),
    ]);
    expectInnocent(events);
  });

  it("red+yellow visible ahead while still rolling up (no crossing)", () => {
    // Innocent: seeing the combination is not entering on it.
    const { events } = drive(
      cruise(0, 5, {
        speedKmh: 12,
        nextStopLineM: 20,
        nextStopLineControl: "trafficLight",
        nextStopLineState: "redYellow",
      }),
    );
    expectInnocent(events);
  });
});

// ---------------------------------------------------------------------------
// Whole-drive integration
// ---------------------------------------------------------------------------

describe("FP battery — whole innocent commute", () => {
  it("a full mixed urban drive with zero mistakes produces zero violations", () => {
    // Innocent end-to-end: spawn with handbrake on, pull away, cruise at the
    // limit, firm stop at a red, proceed on green, textbook lane change, an
    // overtake, a right-hugging stretch, a jittery-but-real Б2 stop, and a
    // reverse parallel park (against the one-way flow, off-centre — as
    // reverse parking is). The single most important trust test in the file.
    const ticks: SimTick[] = [
      // spawn & pull-away
      tick(0, { speedKmh: 0, handbrakeOn: true }),
      tick(1, { speedKmh: 0, handbrakeOn: true }),
      tick(2, { speedKmh: 0, handbrakeOn: false }),
      tick(3, { speedKmh: 8 }),
      tick(4, { speedKmh: 20 }),
      // cruise at the limit
      ...cruise(5, 14, { speedKmh: 50 }),
      // firm stop at a red light
      tick(15, { speedKmh: 30 }),
      tick(16, { speedKmh: 12 }),
      tick(17, { speedKmh: 0.6 }),
      tick(18, { speedKmh: 0.4 }),
      tick(19, { speedKmh: 0.5 }),
      // green — cross and go
      tick(20, { speedKmh: 9, events: [greenLight] }),
      tick(21, { speedKmh: 25 }),
      // textbook lane change out for an overtake
      tick(22, { speedKmh: 40, laneCount: 2, indicator: "left", events: [glance("left")] }),
      tick(23, { speedKmh: 42, laneCount: 2, indicator: "left", laneId: 1 }),
      ...cruise(24, 31, { speedKmh: 55, laneCount: 2, laneId: 1 }),
      tick(32, { speedKmh: 48, laneCount: 2, laneId: 1, indicator: "right", events: [glance("right")] }),
      tick(33, { speedKmh: 45, laneCount: 2, laneId: 0, indicator: "right" }),
      // right-hugging stretch on the wide perceptual lane
      ...cruise(34, 43, { speedKmh: 50, laneOffsetM: -2.5 }),
      // Б2 stop with physics jitter, then proceed
      tick(44, { speedKmh: 25 }),
      tick(45, { speedKmh: 10 }),
      tick(46, { speedKmh: 0.7 }),
      tick(46.5, { speedKmh: 0.5 }),
      tick(47, { speedKmh: 0.6 }),
      tick(48, { speedKmh: 4 }),
      tick(49, { speedKmh: 9, events: [stopSign] }),
      tick(50, { speedKmh: 15 }),
      tick(51, { speedKmh: 8 }),
      // reverse parallel park at the destination
      tick(52, { speedKmh: 5.5, gear: -1, wrongWay: true, laneOffsetM: 2 }),
      tick(53, { speedKmh: 6, gear: -1, wrongWay: true, laneOffsetM: 4 }),
      tick(54, { speedKmh: 4, gear: -1, laneOffsetM: 4.5 }),
      tick(55, { speedKmh: 2, gear: -1, laneOffsetM: 3.4 }),
      tick(56, { speedKmh: 0, gear: 0, handbrakeOn: true }),
    ];
    const { events } = drive(ticks);
    expectInnocent(events);
    // The drive was not just unpunished — it was actively good.
    const commendations = events.filter((e) => e.kind === "commendation").map((e) => e.code);
    expect(commendations).toContain("SAFE_LANE_CHANGE");
    expect(commendations).toContain("FULL_STOP_AT_STOP_SIGN");
  });
});
