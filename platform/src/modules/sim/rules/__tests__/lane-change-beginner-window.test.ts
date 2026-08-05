/**
 * REGISTER B21 — „he must press almost at the same time few buttons … just a
 * second." (founder, catalog 9 „Смяна на лента")
 *
 * The observation windows were set at real-world numbers and then applied to a
 * manoeuvre this simulator makes structurally longer than the real one:
 *
 *  · the lane is DRAWN at PERCEPTUAL_ROAD_SCALE (2.5 × 3.25 m = 8.125 m), so
 *    the lateral traverse to the frame `tick.laneId` flips is 4.06 m, not the
 *    legal 1.63 m — 2.5× the real-world time, at any speed;
 *  · the human beats are strictly SERIAL — KeyQ pins the camera to the mirror,
 *    so a student cannot steer while looking. Release → re-orient → find the
 *    steer key is 1.5–2.5 s on a first drive;
 *  · the stalk AUTO-CANCELS (scene/cabin.ts), so a beginner's wobble
 *    extinguishes his own indicator before the wheels ever cross.
 *
 * The result was upside down: the slower and more carefully a 17-year-old
 * drove, the more likely he was to be convicted. These are the drives that
 * proves both halves — and the two that prove the widening cannot absolve a
 * real fault, because a mistake demo never ARMS its channel at all.
 */

import { describe, expect, it } from "vitest";
import { DEFAULT_RULE_CONFIG, type SimTick, type SimTickEvent } from "../types";
import { codes, drive, tick } from "./fixtures";

/** The values that shipped before B21 — every "was convicted" case uses them. */
const LEGACY = { indicatorLookbackSec: 3, mirrorLookbackSec: 5 } as const;

const glanceLeft: SimTickEvent = { kind: "mirrorGlance", mirror: "left" };
const glanceRear: SimTickEvent = { kind: "mirrorGlance", mirror: "rear" };

/** One second of steady 30 km/h travel in lane `laneId`. */
function sec(t: number, laneId: number, over: Partial<SimTick> = {}): SimTick {
  return tick(t, { speedKmh: 30, laneId, ...over });
}

/**
 * THE BEGINNER DRIVE, in the order sc-lane-change teaches (огледало → мигач →
 * рамо → маневра) at the pace a beginner actually manages on a keyboard:
 *
 *   t=2   ляво огледало            (holds KeyQ — camera is off the road)
 *   t=4   ляв мигач, and HELD      (instruction 3: „включи и задръж")
 *   t=6   поглед през рамо         (KeyQ again — the blind-spot check)
 *   t=13  laneId flips             (release, re-orient, then a gentle 4.06 m)
 *
 * 7 s from the last glance to the crossing — the middle of the 5–7.6 s band a
 * cautious beginner needs, and 2 s outside the window that shipped.
 */
function beginnerLaneChange(): SimTick[] {
  const frames: SimTick[] = [];
  for (let t = 0; t <= 12; t += 1) {
    const events: SimTickEvent[] = [];
    if (t === 2 || t === 6) events.push(glanceLeft);
    frames.push(sec(t, 0, { indicator: t >= 4 ? "left" : "off", events }));
  }
  frames.push(sec(13, 1, { indicator: "left" })); // the wheels cross
  return frames;
}

describe("B21 — the beginner's lane change is no longer a race", () => {
  it("the taught order at a beginner's pace was convicted by the shipped windows", () => {
    const { events } = drive(beginnerLaneChange(), LEGACY);
    expect(codes(events)).toEqual(["LANE_CHANGE_WITHOUT_MIRROR_CHECK"]);
  });

  it("…and is now commended instead, with nothing else fired", () => {
    const { events } = drive(beginnerLaneChange());
    expect(codes(events)).toEqual(["SAFE_LANE_CHANGE"]);
  });

  /**
   * The stalk cancels ITSELF. cabin.ts arms the auto-cancel once the wheel
   * passes AUTOCANCEL_ARM_RAD toward the signalled side and releases it on the
   * way back through AUTOCANCEL_RELEASE_RAD — which is what a beginner's first
   * straighten-and-re-check does, while he is still in the old lane. He gave
   * the signal; the car put it out; the engine billed him for it.
   */
  function wobbleThenCross(): SimTick[] {
    const frames: SimTick[] = [];
    for (let t = 0; t <= 11; t += 1) {
      const events: SimTickEvent[] = [];
      if (t === 10) events.push(glanceLeft);
      // On t=4..8, off from t=9 — the auto-cancel firing on the straighten.
      frames.push(sec(t, 0, { indicator: t >= 4 && t <= 8 ? "left" : "off", events }));
    }
    frames.push(sec(12, 1)); // 4 s after the stalk clicked itself off
    return frames;
  }

  it("a signal the CAR auto-cancelled during the wobble was billed as no signal", () => {
    const { events } = drive(wobbleThenCross(), LEGACY);
    expect(codes(events)).toEqual(["LANE_CHANGE_WITHOUT_INDICATOR"]);
  });

  it("…and now survives the wobble", () => {
    const { events } = drive(wobbleThenCross());
    expect(codes(events)).toEqual(["SAFE_LANE_CHANGE"]);
  });
});

/**
 * THE DRIVE ITSELF, not a model of one.
 *
 * Everything above is authored. This block is a REPLAY of numbers measured in
 * `/dev/drive-rig` on `sc-lane-change` L1 on 2026-08-04 (telemetry:
 * `scratchpad/laneSL/b21/B21beg-telemetry.json`, result screen:
 * `B21beg-end-t50.8-v28.png` — 0 наказателни точки · ИЗДЪРЖАН · ★★★, 2/2
 * objectives). The drive was deliberately unhurried, in the order the lesson
 * teaches, at a beginner's pace on a keyboard, at 27.5 km/h:
 *
 *   t=41.10  ляв мигач on, and HELD from there to the end (instruction 3)
 *   t=42.62  KeyQ down — поглед през рамо (instruction 4)
 *   t=44.42  KeyQ up, after 1.80 s on the blind spot
 *   t=46.43  eyes back on the road, wheel found, the ease-left begins
 *   t=49.15  tick.laneId flips — the wheels cross
 *
 * A held glance re-latches its graded freshness every GLANCE_REFRESH_S = 1 s
 * (scene/cabin.ts), so `lastGlanceAt` lands at 43.62 and the engine measures
 * **5.53 s** from observation to crossing. Nothing in that drive is slow: two
 * seconds to get his eyes off the mirror and find the next control, and a
 * diagonal gentle enough not to frighten anyone. It is 0.53 s over the window
 * that shipped — which is the whole of „he must press almost at the same time
 * few buttons … just a second."
 */
describe("B21 — the measured beginner drive, replayed at both window widths", () => {
  /**
   * Timeline anchored on the KeyQ press (t=0 here = 42.62 s in the recording).
   * The hold re-latches at +1.00 s and is released at +1.80 s, so the LAST
   * graded latch is at 1.00 — and the wheels cross 5.53 s after it (49.15 in
   * the recording, 6.53 s after the press).
   */
  const LAST_LATCH_S = 1.0;
  const GLANCE_TO_CROSSING_S = 5.53;
  const FLIP_S = LAST_LATCH_S + GLANCE_TO_CROSSING_S;

  function measuredDrive(): SimTick[] {
    const frames: SimTick[] = [];
    const at = (t: number, laneId: number, events: SimTickEvent[] = []): void => {
      // Indicator on 1.52 s before the glance and held through the crossing —
      // exactly what instruction 3 asks for („включи и задръж").
      frames.push(tick(t, { speedKmh: 27.5, laneId, indicator: "left", events }));
    };
    for (let t = -1.52; t < 0; t += 0.2) at(Number(t.toFixed(2)), 0);
    at(0, 0, [glanceLeft]); // KeyQ down — the graded latch
    for (let t = 0.2; t < LAST_LATCH_S; t += 0.2) at(Number(t.toFixed(2)), 0);
    at(LAST_LATCH_S, 0, [glanceLeft]); // held: GLANCE_REFRESH_S re-latch
    for (let t = LAST_LATCH_S + 0.2; t < FLIP_S; t += 0.2) at(Number(t.toFixed(2)), 0);
    at(FLIP_S, 1); // the wheels cross into the target lane
    return frames;
  }

  it("was convicted by the windows that shipped — his sentence, from his own pace", () => {
    const { events } = drive(measuredDrive(), LEGACY);
    expect(GLANCE_TO_CROSSING_S).toBeGreaterThan(LEGACY.mirrorLookbackSec);
    expect(codes(events)).toEqual(["LANE_CHANGE_WITHOUT_MIRROR_CHECK"]);
  });

  it("earns the SAFE_LANE_CHANGE commendation now, with nothing else fired", () => {
    const { events } = drive(measuredDrive());
    expect(codes(events)).toEqual(["SAFE_LANE_CHANGE"]);
  });

  it("and the widened window still leaves the drive margin, not a hair", () => {
    // The rig drive finished 51 s against a 50 s par — „спокойно, точността е
    // преди скоростта". A window with no margin over the pace the product
    // itself calls comfortable is a window that will convict the next student
    // who hesitates half a second longer.
    expect(DEFAULT_RULE_CONFIG.mirrorLookbackSec - GLANCE_TO_CROSSING_S).toBeGreaterThanOrEqual(2);
  });
});

describe("B21 — no window width can absolve a mistake demo", () => {
  /**
   * Both authored demos withhold a channel ENTIRELY (traces/scLaneChange.ts):
   * „без мигач" never signals left, „без огледало" never glances left (its rear
   * glance does not clear the left blind spot). The tracker therefore stays
   * `null`, and `null` fails every comparison — so widening the windows is
   * one-way safe by construction, not by tuning. Proved here at an absurd
   * width, so the property holds for any future value too.
   */
  const ABSURD = 1e9;

  it("the no-indicator demo still grades, at any indicator window", () => {
    const frames: SimTick[] = [];
    for (let t = 0; t <= 9; t += 1) {
      frames.push(sec(t, 0, { events: t === 8 ? [glanceLeft] : [] }));
    }
    frames.push(sec(10, 1)); // mirror armed, indicator never was
    const { events } = drive(frames, { indicatorLookbackSec: ABSURD });
    expect(codes(events)).toEqual(["LANE_CHANGE_WITHOUT_INDICATOR"]);
  });

  it("the no-mirror demo still grades, at any mirror window", () => {
    const frames: SimTick[] = [];
    for (let t = 0; t <= 9; t += 1) {
      // The rear glance the demo DOES make — it must not clear the left side.
      frames.push(sec(t, 0, { indicator: "left", events: t === 2 ? [glanceRear] : [] }));
    }
    frames.push(sec(10, 1));
    const { events } = drive(frames, { mirrorLookbackSec: ABSURD });
    expect(codes(events)).toEqual(["LANE_CHANGE_WITHOUT_MIRROR_CHECK"]);
  });
});

describe("B21 — the widened windows, pinned with their reasons", () => {
  it("indicator remembers an extinguished stalk for one full wobble", () => {
    expect(DEFAULT_RULE_CONFIG.indicatorLookbackSec).toBe(5);
  });

  it("mirror covers the serial human beats plus a 2.5×-wide lane's traverse", () => {
    expect(DEFAULT_RULE_CONFIG.mirrorLookbackSec).toBe(8);
  });

  it("both are wider than they were, and neither is stale-glance territory", () => {
    // Past ~10 s a blind-spot observation is genuinely no longer true, and
    // crediting it would teach a lie — the ceiling this sits under.
    expect(DEFAULT_RULE_CONFIG.mirrorLookbackSec).toBeGreaterThan(LEGACY.mirrorLookbackSec);
    expect(DEFAULT_RULE_CONFIG.mirrorLookbackSec).toBeLessThanOrEqual(10);
    expect(DEFAULT_RULE_CONFIG.indicatorLookbackSec).toBeGreaterThan(LEGACY.indicatorLookbackSec);
    expect(DEFAULT_RULE_CONFIG.indicatorLookbackSec).toBeLessThanOrEqual(10);
  });
});
