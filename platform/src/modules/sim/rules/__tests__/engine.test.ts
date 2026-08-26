import { describe, expect, it } from "vitest";
import { createRuleEngine, reduceTick, speedingBands } from "../engine";
import { NORMAL_CAP_MARGIN_KMH } from "../../vehicle";
import { DEFAULT_RULE_CONFIG, type RuleEvent, type SimTick, type SimTickEvent } from "../types";
import { codes, cruise, drive, tick } from "./fixtures";

// -- event shorthands --------------------------------------------------------

const redLight: SimTickEvent = {
  kind: "stopLineCrossed",
  control: "trafficLight",
  lightState: "red",
};
const stopSign: SimTickEvent = { kind: "stopLineCrossed", control: "stopSign" };
const glance = (mirror: "left" | "right" | "rear"): SimTickEvent => ({
  kind: "mirrorGlance",
  mirror,
});
const turn = (direction: "left" | "right"): SimTickEvent => ({ kind: "turnStarted", direction });
const zoneEntered = (pedestrianOnCrossing: boolean, crossingId = "x1"): SimTickEvent => ({
  kind: "crossingZoneEntered",
  crossingId,
  pedestrianOnCrossing,
});
const zonePassed = (pedestrianOnCrossing: boolean, crossingId = "x1"): SimTickEvent => ({
  kind: "crossingPassed",
  crossingId,
  pedestrianOnCrossing,
});
const collision = (withWhat: "vehicle" | "pedestrian" | "cyclist" | "staticObject"): SimTickEvent => ({
  kind: "collision",
  withWhat,
});

// ---------------------------------------------------------------------------
// Speeding (doc 32: опасна strictly above limit + 10 km/h; 10% grace below)
// ---------------------------------------------------------------------------

describe("speeding detector", () => {
  it("does not fire at exactly the limit", () => {
    const { events } = drive(cruise(0, 10, { speedKmh: 50 }));
    expect(events).toEqual([]);
  });

  it("does not fire at exactly the 10% grace boundary (55 @ 50)", () => {
    const { events } = drive(cruise(0, 10, { speedKmh: 55 }));
    expect(events).toEqual([]);
  });

  it("fires второстепенна once the graced limit is exceeded for the sustain window", () => {
    const { events } = drive(cruise(0, 2, { speedKmh: 56 }));
    expect(codes(events)).toEqual(["SPEEDING_OVER_LIMIT"]);
    expect(events[0]).toMatchObject({ severityClass: "vtorostepenna", points: 1, t: 2 });
  });

  it("does not fire before the sustain window elapses", () => {
    const { events } = drive(cruise(0, 1, { speedKmh: 56 }));
    expect(events).toEqual([]);
  });

  it("fires once per repeat window while continuously over (M-16)", () => {
    // 30 s at 58 in a 50: billed at t=2, RE-GRADED at t=8 (SPEED_REGRADE_SEC —
    // the charge the teach-first free lesson consumed), and billed again a
    // speedingRepeatSec after the FIRST bill. The M-16 cadence itself is
    // untouched: the 2 and the 22 are where they always were.
    const { events } = drive(cruise(0, 30, { speedKmh: 58 }));
    expect(codes(events)).toEqual([
      "SPEEDING_OVER_LIMIT",
      "SPEEDING_OVER_LIMIT",
      "SPEEDING_OVER_LIMIT",
    ]);
    expect(events.map((e) => e.t)).toEqual([2, 8, 22]);
    // Only the middle one is the re-grade, and it says so — `lessons/engine.ts`
    // drops exactly this event whenever the code has already been charged, so
    // an exam candidate's ledger is unchanged.
    expect(events.map((e) => e.kind === "violation" && e.regrade === true)).toEqual([
      false,
      true,
      false,
    ]);
  });

  it("re-arms only after the limit is HELD for the cooldown (M-16)", () => {
    const { events } = drive([
      ...cruise(0, 2, { speedKmh: 56 }), // fires at t=2
      ...cruise(3, 8, { speedKmh: 50 }), // 5 s at the limit >= speedingRearmSec
      ...cruise(9, 11, { speedKmh: 56 }), // a genuinely separate offence => fires
    ]);
    expect(codes(events)).toEqual(["SPEEDING_OVER_LIMIT", "SPEEDING_OVER_LIMIT"]);
  });

  it("a one-second dip under the limit does NOT re-arm the bill (M-16)", () => {
    // The audit's saw-tooth: the driver keeps correcting, and every correction
    // used to buy a fresh point. Twelve dips must not cost twelve points.
    const frames: SimTick[] = [];
    let t = 0;
    for (let cycle = 0; cycle < 12; cycle++) {
      frames.push(tick(t++, { speedKmh: 56 }));
      frames.push(tick(t++, { speedKmh: 56 }));
      frames.push(tick(t++, { speedKmh: 56 }));
      frames.push(tick(t++, { speedKmh: 48 })); // dip back under, one frame
    }
    const { events } = drive(frames);
    // 48 s of oscillation: the opening bill plus the repeat cadence (~1 per
    // 20 s) — not the twelve the old per-dip re-arm produced.
    const speeding = codes(events).filter((c) => c === "SPEEDING_OVER_LIMIT");
    expect(speeding.length).toBeGreaterThanOrEqual(1);
    expect(speeding.length).toBeLessThanOrEqual(3);
  });

  it("sustained speeding is never cheaper than oscillating around the limit (M-16)", () => {
    // The finding, stated as an invariant: the steadier — more dangerous —
    // drive must not be graded below the one that keeps dipping legal.
    const steady = drive(cruise(0, 60, { speedKmh: 58 }));
    const sawFrames: SimTick[] = [];
    let t = 0;
    for (let cycle = 0; cycle < 20; cycle++) {
      sawFrames.push(tick(t++, { speedKmh: 58 }));
      sawFrames.push(tick(t++, { speedKmh: 58 }));
      sawFrames.push(tick(t++, { speedKmh: 48 }));
    }
    const saw = drive(sawFrames);
    const points = (r: { events: RuleEvent[] }): number =>
      r.events.reduce((sum, e) => sum + (e.kind === "violation" ? e.points : 0), 0);
    expect(points(steady)).toBeGreaterThanOrEqual(points(saw));
  });

  it("does NOT re-fire when speed only dips into the grace band (52 @ 50)", () => {
    const { events } = drive([
      ...cruise(0, 2, { speedKmh: 56 }), // fires at t=2
      tick(3, { speedKmh: 52 }), // still above the limit => episode continues
      ...cruise(4, 8, { speedKmh: 56 }),
    ]);
    expect(codes(events)).toEqual(["SPEEDING_OVER_LIMIT"]);
  });

  it("exactly +10 km/h over is NOT опасна — it is второстепенна (doc 32: strictly more than 10)", () => {
    const { events } = drive(cruise(0, 3, { speedKmh: 60 }));
    expect(codes(events)).toEqual(["SPEEDING_OVER_LIMIT"]);
  });

  it("fires опасна above +10 km/h over the limit", () => {
    const { events } = drive(cruise(0, 1, { speedKmh: 61 }));
    expect(codes(events)).toEqual(["SPEEDING_DANGEROUS"]);
    expect(events[0]).toMatchObject({ severityClass: "opasna", points: 10 });
  });

  it("escalating episode emits both второстепенна and опасна", () => {
    const { events } = drive([
      ...cruise(0, 2, { speedKmh: 57 }), // minor fires at t=2
      ...cruise(3, 4, { speedKmh: 65 }), // dangerous fires at t=4
    ]);
    expect(codes(events)).toEqual(["SPEEDING_OVER_LIMIT", "SPEEDING_DANGEROUS"]);
  });

  it("a jump straight into the dangerous band emits ONLY опасна", () => {
    const { events } = drive(cruise(0, 5, { speedKmh: 70 }));
    expect(codes(events)).toEqual(["SPEEDING_DANGEROUS"]);
  });

  it("high limits: опасна at +11 even though inside the 10% grace (131 @ 120)", () => {
    const { events } = drive(cruise(0, 1, { speedKmh: 131, maxSpeedKmh: 120 }));
    expect(codes(events)).toEqual(["SPEEDING_DANGEROUS"]);
  });

  it("high limits: the второстепенна band still EXISTS above 100 (130 @ 120) — M-14", () => {
    // Was the audit's dead code: a 10% grace (132) sitting above the +10
    // опасна line (130) made SPEEDING_OVER_LIMIT unreachable on every fast
    // road. The capped grace puts the graded band back at 125 < v <= 130.
    const { events } = drive(cruise(0, 3, { speedKmh: 130, maxSpeedKmh: 120 }));
    expect(codes(events)).toEqual(["SPEEDING_OVER_LIMIT"]);
  });

  it("high limits: inside the capped grace stays silent (124 @ 120) — M-14", () => {
    const { events } = drive(cruise(0, 10, { speedKmh: 124, maxSpeedKmh: 120 }));
    expect(events.filter((e) => e.kind === "violation")).toEqual([]);
  });

  it("M-14: a gradable второстепенна band exists at every posted limit", () => {
    // The structural guarantee, not one sampled road: grace must stay strictly
    // under the опасна threshold so the band can never close again.
    for (const limit of [20, 30, 40, 50, 60, 70, 80, 90, 100, 110, 120, 130, 140]) {
      const b = speedingBands(limit, DEFAULT_RULE_CONFIG);
      expect(b.gradedAbove, `limit ${limit}`).toBeLessThan(b.dangerousAbove);
    }
  });

  it("M-14: the Нормален governor can still reach the graded band on a 140 map", () => {
    // The default difficulty caps the car at limit + NORMAL_CAP_MARGIN_KMH.
    // Before the fix that cap (150) sat under BOTH thresholds on the motorway
    // maps, so neither speeding code could fire at the shipped default.
    const cap = 140 + NORMAL_CAP_MARGIN_KMH;
    expect(speedingBands(140, DEFAULT_RULE_CONFIG).gradedAbove).toBeLessThan(cap);
    const { events } = drive(cruise(0, 3, { speedKmh: cap - 2, maxSpeedKmh: 140 }));
    expect(codes(events)).toEqual(["SPEEDING_OVER_LIMIT"]);
  });

  it("urban maps grade byte-identically to before the M-14 cap (55/56 @ 50)", () => {
    // 10% of 50 == the 5 km/h ceiling, so no city drive changes verdict.
    expect(speedingBands(50, DEFAULT_RULE_CONFIG)).toEqual({
      gradedAbove: 55,
      dangerousAbove: 60,
    });
  });

  it("a limit increase mid-episode resets the episode (55 leaving a 50 zone into 90)", () => {
    const { events } = drive([
      tick(0, { speedKmh: 56 }),
      ...cruise(1, 5, { speedKmh: 56, maxSpeedKmh: 90 }),
    ]);
    expect(events).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// Red light & Б2 stop sign
// ---------------------------------------------------------------------------

describe("red light detector", () => {
  it("crossing on red is опасна", () => {
    const { events } = drive([tick(1, { speedKmh: 30, events: [redLight] })]);
    expect(codes(events)).toEqual(["RED_LIGHT_CROSSED"]);
    expect(events[0]).toMatchObject({ severityClass: "opasna", points: 10, conceptId: "c-traffic-light-signals" });
  });

  it("crossing on green or yellow emits nothing (yellow: open question, v1 silent)", () => {
    const { events } = drive([
      tick(1, {
        speedKmh: 30,
        events: [{ kind: "stopLineCrossed", control: "trafficLight", lightState: "green" }],
      }),
      tick(2, {
        speedKmh: 30,
        events: [{ kind: "stopLineCrossed", control: "trafficLight", lightState: "yellow" }],
      }),
    ]);
    expect(events).toEqual([]);
  });
});

describe("Б2 stop sign detector", () => {
  it("a real full stop before the line earns a commendation, no violation", () => {
    const { events } = drive([
      tick(0, { speedKmh: 20 }),
      tick(1, { speedKmh: 0 }),
      tick(2, { speedKmh: 0 }), // stopped >= 0.5 s => qualifying
      tick(3, { speedKmh: 5 }),
      tick(4, { speedKmh: 10, events: [stopSign] }),
    ]);
    expect(codes(events)).toEqual(["FULL_STOP_AT_STOP_SIGN"]);
    expect(events[0].kind).toBe("commendation");
  });

  it("a rolling 'almost stop' is опасна", () => {
    const { events } = drive([
      tick(0, { speedKmh: 20 }),
      tick(1, { speedKmh: 4 }),
      tick(2, { speedKmh: 3, events: [stopSign] }),
    ]);
    expect(codes(events)).toEqual(["STOP_SIGN_NO_FULL_STOP"]);
    expect(events[0]).toMatchObject({ severityClass: "opasna", points: 10 });
  });

  it("a too-brief stop (under the minimum duration) does not qualify", () => {
    const { events } = drive([
      tick(0, { speedKmh: 10 }),
      tick(0.3, { speedKmh: 0 }),
      tick(0.6, { speedKmh: 0 }), // only 0.3 s stopped
      tick(0.7, { speedKmh: 8 }),
      tick(1, { speedKmh: 10, events: [stopSign] }),
    ]);
    expect(codes(events)).toEqual(["STOP_SIGN_NO_FULL_STOP"]);
  });

  it("a stop that ended too long before the line does not qualify (recency window)", () => {
    const { events } = drive([
      tick(0, { speedKmh: 0 }),
      tick(1, { speedKmh: 0 }), // qualifying stop, ends at t=1
      ...cruise(2, 7, { speedKmh: 3 }),
      tick(8, { speedKmh: 3, events: [stopSign] }), // 7 s later > 6 s window
    ]);
    expect(codes(events)).toEqual(["STOP_SIGN_NO_FULL_STOP"]);
  });
});

// ---------------------------------------------------------------------------
// Indicators: turns & lane changes; mirror checks
// ---------------------------------------------------------------------------

describe("turn indicator detector", () => {
  it("indicator on at the moment of the turn — no violation", () => {
    const { events } = drive([tick(0, { speedKmh: 20, indicator: "left", events: [turn("left")] })]);
    expect(events).toEqual([]);
  });

  it("indicator turned off shortly before the turn (within lookback) — no violation", () => {
    const { events } = drive([
      tick(0, { speedKmh: 20, indicator: "left" }),
      tick(2, { speedKmh: 15, events: [turn("left")] }),
    ]);
    expect(events).toEqual([]);
  });

  it("turning with no indicator at all is основна", () => {
    const { events } = drive([tick(0, { speedKmh: 20, events: [turn("right")] })]);
    expect(codes(events)).toEqual(["TURN_WITHOUT_INDICATOR"]);
    expect(events[0]).toMatchObject({ severityClass: "osnovna", points: 3 });
  });

  it("indicator too long ago (beyond lookback) counts as missing", () => {
    const { events } = drive([
      tick(0, { speedKmh: 20, indicator: "left" }),
      // 6 s > the 5 s indicatorLookbackSec. Register B21 widened it from 3 to
      // 5 because the stalk auto-cancels itself on a beginner's wobble — see
      // rules/types.ts and lane-change-beginner-window.test.ts.
      tick(6, { speedKmh: 15, events: [turn("left")] }),
    ]);
    expect(codes(events)).toEqual(["TURN_WITHOUT_INDICATOR"]);
  });

  it("the WRONG-direction indicator counts as missing", () => {
    const { events } = drive([
      tick(0, { speedKmh: 20, indicator: "right", events: [turn("left")] }),
    ]);
    expect(codes(events)).toEqual(["TURN_WITHOUT_INDICATOR"]);
  });
});

describe("lane change detectors (indicator within 5 s, mirror within 8 s)", () => {
  it("indicator + correct-side mirror glance => commendation, no violations", () => {
    const { events } = drive([
      tick(0, { speedKmh: 40, indicator: "left", events: [glance("left")] }),
      tick(1, { speedKmh: 40, indicator: "left", laneId: 1 }),
    ]);
    expect(codes(events)).toEqual(["SAFE_LANE_CHANGE"]);
  });

  it("no indicator => LANE_CHANGE_WITHOUT_INDICATOR (основна)", () => {
    const { events } = drive([
      tick(0, { speedKmh: 40, events: [glance("left")] }),
      tick(1, { speedKmh: 40, laneId: 1 }),
    ]);
    expect(codes(events)).toEqual(["LANE_CHANGE_WITHOUT_INDICATOR"]);
    expect(events[0]).toMatchObject({ severityClass: "osnovna", points: 3 });
  });

  it("no mirror glance => LANE_CHANGE_WITHOUT_MIRROR_CHECK (основна)", () => {
    const { events } = drive([
      tick(0, { speedKmh: 40, indicator: "left" }),
      tick(1, { speedKmh: 40, indicator: "left", laneId: 1 }),
    ]);
    expect(codes(events)).toEqual(["LANE_CHANGE_WITHOUT_MIRROR_CHECK"]);
  });

  it("neither indicator nor glance => both violations, no commendation", () => {
    const { events } = drive([
      tick(0, { speedKmh: 40 }),
      tick(1, { speedKmh: 40, laneId: 1 }),
    ]);
    expect(codes(events).sort()).toEqual([
      "LANE_CHANGE_WITHOUT_INDICATOR",
      "LANE_CHANGE_WITHOUT_MIRROR_CHECK",
    ]);
  });

  // Register B21 moved this boundary from 5 s to 8 s: the window has to cover
  // the serial keyboard beats AND the lateral traverse of a lane drawn at
  // PERCEPTUAL_ROAD_SCALE (4.06 m, not 1.63 m). See rules/types.ts.
  it("glance exactly 8 s before the change still counts (boundary inclusive)", () => {
    const { events } = drive([
      tick(0, { speedKmh: 40, events: [glance("left")] }),
      ...cruise(1, 7, { speedKmh: 40 }),
      tick(8, { speedKmh: 40, indicator: "left", laneId: 1 }),
    ]);
    expect(codes(events)).toEqual(["SAFE_LANE_CHANGE"]);
  });

  it("glance 9 s before the change is too old", () => {
    const { events } = drive([
      tick(0, { speedKmh: 40, events: [glance("left")] }),
      ...cruise(1, 8, { speedKmh: 40 }),
      tick(9, { speedKmh: 40, indicator: "left", laneId: 1 }),
    ]);
    expect(codes(events)).toEqual(["LANE_CHANGE_WITHOUT_MIRROR_CHECK"]);
  });

  it("a RIGHT change needs the RIGHT mirror — left glance does not count", () => {
    const { events } = drive([
      tick(0, { speedKmh: 40, laneId: 1, indicator: "right", events: [glance("left")] }),
      tick(1, { speedKmh: 40, laneId: 0, indicator: "right" }),
    ]);
    expect(codes(events)).toEqual(["LANE_CHANGE_WITHOUT_MIRROR_CHECK"]);
  });

  it("rear mirror alone does not satisfy the side-mirror requirement (documented decision)", () => {
    const { events } = drive([
      tick(0, { speedKmh: 40, indicator: "left", events: [glance("rear")] }),
      tick(1, { speedKmh: 40, indicator: "left", laneId: 1 }),
    ]);
    expect(codes(events)).toEqual(["LANE_CHANGE_WITHOUT_MIRROR_CHECK"]);
  });

  it("lane-id shuffles below the minimum speed (parking) are ignored", () => {
    const { events } = drive([
      tick(0, { speedKmh: 3 }),
      tick(1, { speedKmh: 3, laneId: 1 }),
    ]);
    expect(events).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// Continuous state detectors: seatbelt / handbrake / headlights
// ---------------------------------------------------------------------------

describe("seatbelt detector", () => {
  it("fires основна after moving unbelted for the sustain window", () => {
    const { events } = drive(cruise(0, 3, { seatbeltOn: false, speedKmh: 20 }));
    expect(codes(events)).toEqual(["SEATBELT_OFF_WHILE_MOVING"]);
    expect(events[0]).toMatchObject({ severityClass: "osnovna", points: 3, conceptId: "c-seatbelts" });
  });

  it("does not fire while stationary", () => {
    const { events } = drive(cruise(0, 10, { seatbeltOn: false, speedKmh: 0 }));
    expect(events).toEqual([]);
  });

  it("re-belting re-arms the detector; unbelting again fires a second time", () => {
    const { events } = drive([
      ...cruise(0, 1, { seatbeltOn: false, speedKmh: 20 }), // fires at t=1
      tick(2, { seatbeltOn: true, speedKmh: 20 }), // reset
      ...cruise(3, 4, { seatbeltOn: false, speedKmh: 20 }), // fires at t=4
    ]);
    expect(codes(events)).toEqual(["SEATBELT_OFF_WHILE_MOVING", "SEATBELT_OFF_WHILE_MOVING"]);
  });

  it("slowing below the moving threshold does NOT re-arm (belt still off)", () => {
    const { events } = drive([
      ...cruise(0, 1, { seatbeltOn: false, speedKmh: 20 }), // fires at t=1
      tick(2, { seatbeltOn: false, speedKmh: 3 }), // crawling, belt still off
      ...cruise(3, 8, { seatbeltOn: false, speedKmh: 20 }),
    ]);
    expect(codes(events)).toEqual(["SEATBELT_OFF_WHILE_MOVING"]);
  });
});

describe("handbrake detector", () => {
  it("fires второстепенна after driving with the handbrake for the sustain window", () => {
    const { events } = drive(cruise(0, 2, { handbrakeOn: true, speedKmh: 15 }));
    expect(codes(events)).toEqual(["HANDBRAKE_LEFT_ON"]);
    expect(events[0]).toMatchObject({ severityClass: "vtorostepenna", points: 1 });
  });

  it("releasing re-arms; pulling it again while moving fires again", () => {
    const { events } = drive([
      ...cruise(0, 2, { handbrakeOn: true, speedKmh: 15 }),
      tick(3, { handbrakeOn: false, speedKmh: 15 }),
      ...cruise(4, 6, { handbrakeOn: true, speedKmh: 15 }),
    ]);
    expect(codes(events)).toEqual(["HANDBRAKE_LEFT_ON", "HANDBRAKE_LEFT_ON"]);
  });
});

describe("headlights-at-night detector", () => {
  it("fires основна when moving at night with lights off", () => {
    const { events } = drive(cruise(0, 2, { isNight: true, headlights: "off", speedKmh: 30 }));
    expect(codes(events)).toEqual(["HEADLIGHTS_OFF_AT_NIGHT"]);
    expect(events[0]).toMatchObject({ severityClass: "osnovna", points: 3, conceptId: "c-night-visibility" });
  });

  it("silent during the day with lights off", () => {
    const { events } = drive(cruise(0, 10, { isNight: false, headlights: "off", speedKmh: 30 }));
    expect(events).toEqual([]);
  });

  it("silent at night with low beams on", () => {
    const { events } = drive(cruise(0, 10, { isNight: true, headlights: "low", speedKmh: 30 }));
    expect(events).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// Pedestrian crossings
// ---------------------------------------------------------------------------

describe("pedestrian crossing detectors", () => {
  it("sustained fast approach with a pedestrian present is опасна (once)", () => {
    const { events } = drive([
      tick(0, { speedKmh: 45, events: [zoneEntered(true)] }),
      tick(1, { speedKmh: 45 }),
      tick(2, { speedKmh: 45 }),
    ]);
    expect(codes(events)).toEqual(["PEDESTRIAN_CROSSING_TOO_FAST"]);
    expect(events[0]).toMatchObject({ severityClass: "opasna", points: 10, conceptId: "c-crosswalk-yield" });
  });

  it("braking promptly through the zone and yielding earns the commendation", () => {
    const { events } = drive([
      tick(0, { speedKmh: 45, events: [zoneEntered(true)] }),
      tick(0.5, { speedKmh: 25 }),
      tick(1, { speedKmh: 5 }),
      tick(2, { speedKmh: 5 }),
      tick(3, { speedKmh: 20, events: [zonePassed(false)] }),
    ]);
    expect(codes(events)).toEqual(["PEDESTRIAN_YIELDED"]);
  });

  it("crossing while the pedestrian is still on the crossing is опасна", () => {
    const { events } = drive([
      tick(0, { speedKmh: 20, events: [zoneEntered(true)] }),
      tick(2, { speedKmh: 20, events: [zonePassed(true)] }),
    ]);
    expect(codes(events)).toEqual(["PEDESTRIAN_NOT_YIELDED"]);
  });

  it("an empty crossing passed fast emits nothing", () => {
    const { events } = drive([
      tick(0, { speedKmh: 45, events: [zoneEntered(false)] }),
      tick(1, { speedKmh: 45 }),
      tick(2, { speedKmh: 45, events: [zonePassed(false)] }),
    ]);
    expect(events).toEqual([]);
  });

  it("a pedestrian stepping on AFTER zone entry (presence update) arms the too-fast check", () => {
    const { events } = drive([
      tick(0, { speedKmh: 45, events: [zoneEntered(false)] }),
      tick(1, { speedKmh: 45, events: [zoneEntered(true)] }), // engine re-emits with update
      tick(2, { speedKmh: 45 }),
    ]);
    expect(codes(events)).toEqual(["PEDESTRIAN_CROSSING_TOO_FAST"]);
  });

  it("no commendation when the driver never actually slowed (pedestrian cleared on their own)", () => {
    const { events } = drive([
      tick(0, { speedKmh: 20, events: [zoneEntered(true)] }),
      tick(1, { speedKmh: 20 }),
      tick(2, { speedKmh: 20, events: [zonePassed(false)] }),
    ]);
    expect(events).toEqual([]);
  });

  it("no commendation for a zone where the too-fast violation already fired", () => {
    const { events } = drive([
      tick(0, { speedKmh: 45, events: [zoneEntered(true)] }),
      tick(1, { speedKmh: 45 }), // too-fast fires
      tick(2, { speedKmh: 5 }),
      tick(3, { speedKmh: 5, events: [zonePassed(false)] }),
    ]);
    expect(codes(events)).toEqual(["PEDESTRIAN_CROSSING_TOO_FAST"]);
  });
});

// ---------------------------------------------------------------------------
// Collisions
// ---------------------------------------------------------------------------

describe("collision detector", () => {
  it("collision is опасна, flags session termination, and bills the encounter once", () => {
    // Both reports name the same KIND of body, because that is what "still
    // touching" means — a car you are embedded in does not become a bollard
    // between two frames. The fixture used to switch to "staticObject" here
    // and the assertion held only because the encounter latch was global; with
    // the latch per body-kind (see the `collision` case) that spelling is a
    // second victim, and the case below now pins it as one.
    const { state, events } = drive([
      tick(1, { speedKmh: 30, events: [collision("vehicle")] }),
      tick(2, { speedKmh: 0, events: [collision("vehicle")] }), // still touching
    ]);
    expect(codes(events)).toEqual(["COLLISION"]);
    expect(events[0]).toMatchObject({
      severityClass: "opasna",
      points: 10,
      terminateSession: true,
      detail: "vehicle",
    });
    expect(state.terminated).toBe(true);
  });

  it("a car and then a bollard, one second apart, is TWO accidents", () => {
    // The opposite of the case above and the reason it had to be respelled: a
    // second later is INSIDE collisionSeparationSec, so a global latch billed
    // this once. Two bodies were hit; two «Пътнотранспортно произшествие» are
    // owed. The encounter is per body-kind, and one second is not enough time
    // for a car to have become a bollard.
    const { events } = drive([
      tick(1, { speedKmh: 30, events: [collision("vehicle")] }),
      tick(2, { speedKmh: 20, events: [collision("staticObject")] }),
    ]);
    expect(codes(events)).toEqual(["COLLISION", "COLLISION"]);
    expect(events[0]).toMatchObject({ detail: "vehicle" });
    expect(events[1]).toMatchObject({ detail: "staticObject" });
  });

  it("a genuinely separate collision, after the bodies came apart, fires again", () => {
    const { events } = drive([
      tick(1, { speedKmh: 30, events: [collision("vehicle")] }),
      tick(5, { speedKmh: 20, events: [collision("staticObject")] }),
    ]);
    expect(codes(events)).toEqual(["COLLISION", "COLLISION"]);
  });

  // -------------------------------------------------------------------------
  // ONE ENCOUNTER = ONE ACCIDENT (the DEDUPE wave). The two cases below are
  // the definition, and they must both hold or the rule is not the rule:
  // a scrape is one accident however long it lasts, and a re-hit after the
  // bodies parted is a second one however quickly it follows.
  //
  // What made this necessary, measured on the shipped code: the old rule was a
  // 3 s RATE LIMIT, so a contact that kept being reported billed 10 points
  // every 3 s forever — 11 «Пътнотранспортно произшествие» for 30 s of one
  // touch — while a real second impact 1 s after the first billed nothing.
  // -------------------------------------------------------------------------

  /** Contact reported on every frame from t0 for `sec`, at `hz`. */
  function contactStream(t0: number, sec: number, hz: number, gapSec = 0): SimTick[] {
    const out: SimTick[] = [];
    const step = 1 / hz;
    for (let t = t0; t <= t0 + sec + 1e-9; t += step) {
      const touching = gapSec === 0 || t <= t0 || t > t0 + gapSec;
      out.push(tick(Number(t.toFixed(4)), {
        speedKmh: 6,
        events: touching ? [collision("staticObject")] : [],
      }));
    }
    return out;
  }

  it("scraping along a wall for four seconds is ONE accident, not two", () => {
    // 60 Hz of unbroken contact — the render-rate live loop. The old rate limit
    // billed this twice (t = 0 and t = 3).
    const { events } = drive(contactStream(0, 4, 60));
    expect(codes(events)).toEqual(["COLLISION"]);
    expect(events[0].t).toBe(0);
  });

  it("thirty seconds pressed against the same bumper is still ONE accident", () => {
    // The founder's report: nine «Пътнотранспортно произшествие» — 90 points —
    // out of one encounter down the standing column. Rapier itself does not
    // re-fire a sustained contact (measured: one enter, zero exits in 30 s);
    // the NPC shell pool does, because it rebinds every 0.5 s and a rebound
    // shell is teleported, which re-fires collisionEnter at exactly that
    // cadence. So this is the founder's stream: contact re-reported at 2 Hz.
    const frames: SimTick[] = [];
    for (let t = 0; t <= 30; t += 0.5) {
      frames.push(tick(t, { speedKmh: 0, events: [collision("vehicle")] }));
    }
    const { events } = drive(frames);
    expect(codes(events)).toEqual(["COLLISION"]);
  });

  it("hit, reverse out, hit again is TWO accidents", () => {
    // 2.35 s of daylight — MEASURED in rapier as the fastest a chassis can back
    // 1 m off a shell and drive back into it, with an instant gearbox and no
    // interlocks. The real D→N→R gate makes a student's version longer.
    const { events } = drive([
      tick(0, { speedKmh: 12, events: [collision("vehicle")] }),
      ...cruise(0.5, 2, { speedKmh: -6, gear: -1 }), // backing off, no contact
      tick(2.35, { speedKmh: 8, events: [collision("vehicle")] }),
    ]);
    expect(codes(events)).toEqual(["COLLISION", "COLLISION"]);
  });

  it("a guardrail scraped at speed is ONE accident — the silence window, driven", () => {
    // THE SILENCE WINDOW HAD NO BEHAVIOURAL TEST. Deleting the conjunct left
    // every collision case in the repo green, because the two drives that
    // exercise the rule at low speed are already held by the 2 m floor. At
    // road speed they are not: 30 км/ч covers 4.2 m between two shell-pool
    // rebinds, so the floor is cleared 0.5 s after every report, and the road
    // ahead is clear so the daylight stamp is fresh too. Only the separation
    // window is left standing between one scrape down a guardrail and eight
    // «Пътнотранспортно произшествие», 80 наказателни точки against an
    // allowance of 9.
    const crashes = (ticks: SimTick[]): string[] =>
      codes(drive(ticks).events).filter((c) => c === "COLLISION");
    const frames: SimTick[] = [];
    for (let t = 0; t <= 4; t += 0.5) {
      // 40 m of clear road — daylight for the latch, and far enough back that
      // the following-distance detector has nothing to say about it.
      frames.push(tick(t, { speedKmh: 30, leadGapM: 40, events: [collision("staticObject")] }));
    }
    expect(crashes(frames)).toEqual(["COLLISION"]);
    // The opposite direction on the identical drive: hold the rebind cadence
    // but let the reporter go quiet past the window, and the second scrape is
    // a second accident that must still cost its ten.
    const parted = frames.filter((f) => f.t <= 0.5 || f.t >= 2.5);
    expect(crashes(parted)).toEqual(["COLLISION", "COLLISION"]);
  });

  it("the separation window sits clear of BOTH neighbours it has to separate", () => {
    // Floor: the 0.5 s shell-rebind gap must read as the same encounter.
    // Ceiling: 2.35 s of daylight must read as a new one. The configured
    // window has to be strictly between them or one of the two cases breaks.
    // The behavioural halves are the two cases above this one and «hit,
    // reverse out, hit again»; this pins the number they both ride on.
    const cfg = createRuleEngine().config;
    expect(cfg.collisionSeparationSec).toBeGreaterThan(0.5);
    expect(cfg.collisionSeparationSec).toBeLessThan(2.35);
  });

  it("a burst of contacts drained into ONE tick bills once", () => {
    // worldRuntime empties its collisionQueue into whichever tick comes next,
    // so a paused/slow frame can deliver nine at the same timestamp.
    const nine = Array.from({ length: 9 }, () => collision("vehicle"));
    const { events } = drive([tick(1, { speedKmh: 20, events: nine })]);
    expect(codes(events)).toEqual(["COLLISION"]);
  });

  // -------------------------------------------------------------------------
  // …AND THE SILENCE IS NOT ENOUGH ON ITS OWN (the 2026-08-16 catalogue sweep).
  //
  // Every case above assumes a reporter that keeps reporting for as long as the
  // bodies are together. The sweep found four scenarios where one did not, and
  // the engine converted the gap into fresh accidents: 490 наказателни точки on
  // `sc-follow-standstill`, 420 on `sc-ov-abort`, 252 on `sc-ov-return-gap`,
  // 141 on `sc-ov-oncoming-gap` — each printed above the card's own sentence
  // saying a collision is ONE dangerous error worth ten.
  //
  // The pair below is the contract: a car that did not move cannot re-open an
  // encounter no matter how the reports arrive, and a car that genuinely left
  // and came back still bills twice. Both directions, because a rule that only
  // ever forgives is the false-pass version of the same crime.
  //
  // AND THE POINTS ARE NOT THE ONLY THING IT COSTS. Every bill carrying
  // `terminateSession` re-arms the FR-B5-JAM crash pin with a fresh pose and a
  // null stillness clock (`lessons/engine.ts`, the crashPin block), so a drive
  // billed every 4 s can never complete the CRASH_PIN_STUCK_S = 10 s the
  // rescue needs — the drive that cannot move is also the drive that cannot
  // end. Driven 2026-08-17 through `tools/mobile/lesson-audit.mjs` on
  // `sc-follow-standstill · mobile · wrong`: «the drive stopped after 211s
  // without the session ending (its whole 210s budget)», the collision card
  // still up at 4 км/ч, and «no control on this screen ends the session».
  // -------------------------------------------------------------------------

  it("an embedded car whose reporter falls silent for 4 s at a time is ONE accident", () => {
    // The `sc-ov-abort` stream, reduced to its mechanism: contact re-reported
    // every 4 s (past the 1.2 s separation window) while the car sits at
    // 0 км/ч inside the lead's body. MEASURED on the shipped rule before the
    // travel gate: 16 bills / 160 наказателни точки over 60 s.
    const frames: SimTick[] = [];
    for (let t = 0; t <= 60; t += 0.5) {
      const reported = Math.abs(t % 4) < 1e-9;
      frames.push(
        tick(t, { speedKmh: 0, events: reported ? [collision("vehicle")] : [] }),
      );
    }
    const { events } = drive(frames);
    expect(codes(events)).toEqual(["COLLISION"]);
  });

  it("…and the same silence still bills twice once the car has actually driven away", () => {
    // The other direction, and the reason the gate is 2 m and not „any motion":
    // struck at t = 0, then 20 km/h for four seconds — 22 m of road, the car is
    // demonstrably somewhere else — and the next contact is a second accident.
    // Without this the fix would be a blanket amnesty for anyone who crashes
    // twice in one drive.
    const frames: SimTick[] = [tick(0, { speedKmh: 20, events: [collision("vehicle")] })];
    for (let t = 0.5; t < 4; t += 0.5) frames.push(tick(t, { speedKmh: 20 }));
    frames.push(tick(4, { speedKmh: 20, events: [collision("staticObject")] }));
    const { events } = drive(frames);
    expect(codes(events)).toEqual(["COLLISION", "COLLISION"]);
  });

  it("the travel a stopped car accrues over a long silence is zero, not „whatever dt says\"", () => {
    // A teach card pauses the sim, so a single frame can carry a 90 s dt. The
    // clamp is what stops that pause from being spent as metres the car never
    // drove: same 90 s, car stationary throughout, still one accident.
    const { events } = drive([
      tick(0, { speedKmh: 0, events: [collision("vehicle")] }),
      tick(90, { speedKmh: 0, events: [collision("vehicle")] }),
    ]);
    expect(codes(events)).toEqual(["COLLISION"]);
  });
});

// ---------------------------------------------------------------------------
// Reducer hygiene
// ---------------------------------------------------------------------------

describe("reducer hygiene", () => {
  it("drops non-monotonic frames instead of corrupting the session", () => {
    let state = createRuleEngine();
    state = reduceTick(state, tick(5, { speedKmh: 30 })).state;
    const r = reduceTick(state, tick(3, { speedKmh: 30, events: [redLight] }));
    expect(r.events).toEqual([]);
    expect(r.state.prevT).toBe(5);
  });

  it("never mutates the previous state or the tick (pure reducer)", () => {
    const deepFreeze = (o: unknown): void => {
      if (o === null || typeof o !== "object" || Object.isFrozen(o)) return;
      Object.freeze(o);
      for (const v of Object.values(o)) deepFreeze(v);
    };
    const state = createRuleEngine();
    deepFreeze(state);
    const frame: SimTick = tick(0, {
      speedKmh: 70,
      seatbeltOn: false,
      events: [glance("left"), zoneEntered(true), collision("vehicle")],
    });
    deepFreeze(frame);
    // strict mode: any mutation of a frozen object would throw
    const r = reduceTick(state, frame);
    expect(codes(r.events)).toContain("COLLISION");
    expect(state.prevT).toBeNull();
    expect(state.terminated).toBe(false);
  });

  it("grades a violated prioritySituation but ignores a satisfied one (Phase 2)", () => {
    const bad = drive([
      tick(0, {
        speedKmh: 30,
        events: [{ kind: "prioritySituation", situation: "rightHandRule", violated: true }],
      }),
    ]);
    expect(bad.events.map((e) => e.code)).toEqual(["FAILED_TO_YIELD"]);

    const ok = drive([
      tick(0, {
        speedKmh: 30,
        events: [{ kind: "prioritySituation", situation: "rightHandRule", violated: false }],
      }),
    ]);
    expect(ok.events).toEqual([]);
  });

  it("commends a prioritySituation the driver actively yielded", () => {
    const { events } = drive([
      tick(0, {
        speedKmh: 30,
        events: [
          { kind: "prioritySituation", situation: "rightHandRule", violated: false, yielded: true },
        ],
      }),
    ]);
    expect(events).toHaveLength(1);
    expect(events[0].code).toBe("YIELDED_TO_PRIORITY");
    expect(events[0].kind).toBe("commendation");
  });
});
