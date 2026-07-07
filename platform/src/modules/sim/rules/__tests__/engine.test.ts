import { describe, expect, it } from "vitest";
import { createRuleEngine, reduceTick } from "../engine";
import type { SimTick, SimTickEvent } from "../types";
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

  it("fires only once while continuously over", () => {
    const { events } = drive(cruise(0, 30, { speedKmh: 58 }));
    expect(codes(events)).toEqual(["SPEEDING_OVER_LIMIT"]);
  });

  it("re-arms only after speed returns to the limit (full hysteresis)", () => {
    const { events } = drive([
      ...cruise(0, 2, { speedKmh: 56 }), // fires at t=2
      tick(3, { speedKmh: 50 }), // back to legal => reset
      ...cruise(4, 6, { speedKmh: 56 }), // fires again at t=6
    ]);
    expect(codes(events)).toEqual(["SPEEDING_OVER_LIMIT", "SPEEDING_OVER_LIMIT"]);
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

  it("high limits: exactly +10 stays silent — grace band is empty above 100 (130 @ 120)", () => {
    const { events } = drive(cruise(0, 5, { speedKmh: 130, maxSpeedKmh: 120 }));
    expect(events).toEqual([]);
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
      tick(4, { speedKmh: 15, events: [turn("left")] }), // 4 s > 3 s lookback
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

describe("lane change detectors (indicator + mirror within 5 s)", () => {
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

  it("glance exactly 5 s before the change still counts (boundary inclusive)", () => {
    const { events } = drive([
      tick(0, { speedKmh: 40, events: [glance("left")] }),
      ...cruise(1, 4, { speedKmh: 40 }),
      tick(5, { speedKmh: 40, indicator: "left", laneId: 1 }),
    ]);
    expect(codes(events)).toEqual(["SAFE_LANE_CHANGE"]);
  });

  it("glance 6 s before the change is too old", () => {
    const { events } = drive([
      tick(0, { speedKmh: 40, events: [glance("left")] }),
      ...cruise(1, 5, { speedKmh: 40 }),
      tick(6, { speedKmh: 40, indicator: "left", laneId: 1 }),
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
  it("collision is опасна, flags session termination, and debounces multi-contact", () => {
    const { state, events } = drive([
      tick(1, { speedKmh: 30, events: [collision("vehicle")] }),
      tick(2, { speedKmh: 0, events: [collision("staticObject")] }), // inside 3 s cooldown
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

  it("a genuinely separate collision after the cooldown fires again", () => {
    const { events } = drive([
      tick(1, { speedKmh: 30, events: [collision("vehicle")] }),
      tick(5, { speedKmh: 20, events: [collision("staticObject")] }),
    ]);
    expect(codes(events)).toEqual(["COLLISION", "COLLISION"]);
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

  it("ignores reserved prioritySituation events (v2)", () => {
    const { events } = drive([
      tick(0, {
        speedKmh: 30,
        events: [{ kind: "prioritySituation", situation: "rightHandRule", violated: true }],
      }),
    ]);
    expect(events).toEqual([]);
  });
});
