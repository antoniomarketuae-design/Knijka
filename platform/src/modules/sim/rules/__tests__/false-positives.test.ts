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
import { cruise, drive, tick } from "./fixtures";

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
