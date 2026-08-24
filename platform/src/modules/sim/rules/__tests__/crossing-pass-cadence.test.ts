/**
 * sc-zebra-approach:34ecd82d — THE VERDICT MUST NOT DEPEND ON THE DEVICE.
 *
 * The filed frames: the same scripted wrong drive at the same 59 км/ч books
 * «Твърде бързо приближаване към пешеходна пътека» on PC (pc-wrong/04-t006s,
 * 20 т. with the yield fault) and NOT on mobile (mobile-wrong, 10 т., yield
 * fault only). Nothing in the drive differs; the frame CADENCE does — the
 * mobile harness renders in the sub-10-fps regime `sessionClock.ts` measured,
 * so the reducer samples the ~2.1 s zone transit a handful of times.
 *
 * The divergent path: `crossingPassed` closes `s.crossing` in the discrete
 * pass, which runs BEFORE the continuous too-fast check, so the sustain
 * `t - tooFastSince >= crossingTooFastSustainSec` could only be satisfied by a
 * tick that LANDED inside the zone at least a sustain after onset. That is a
 * requirement on sampling, not on driving: PC's fine cadence always supplies
 * such a tick, a coarse cadence can jump from onset to pass and acquit. The
 * repair adjudicates the still-open episode AT the pass, in wall clock — the
 * same offence, no longer billed per tick count.
 *
 * Both directions pinned (a false refusal is as bad as a false certificate):
 * the coarse drive must convict exactly like the fine one, and the braked
 * approach that A12 protects must stay silent at every cadence.
 */
import { describe, expect, it } from "vitest";

import type { SimTickEvent } from "../types";
import { codes, drive, tick } from "./fixtures";

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

describe("sc-zebra-approach:34ecd82d — crossing verdicts are cadence-independent", () => {
  it("the 59 км/ч approach convicts at mobile cadence exactly as on PC", () => {
    // The zone transit at 59 км/ч ≈ 2.1 s. PC samples it ~250 times; the
    // loaded mobile harness saw entry and pass with nothing between. Same
    // wall clock, same speed, same pedestrian.
    const coarse = [
      tick(0, { speedKmh: 59, maxSpeedKmh: 60, events: [zoneEntered(true)] }),
      tick(2.1, { speedKmh: 59, maxSpeedKmh: 60, events: [zonePassed(true)] }),
    ];
    const fine = [
      tick(0, { speedKmh: 59, maxSpeedKmh: 60, events: [zoneEntered(true)] }),
      tick(1, { speedKmh: 59, maxSpeedKmh: 60 }),
      tick(2, { speedKmh: 59, maxSpeedKmh: 60 }),
      tick(2.1, { speedKmh: 59, maxSpeedKmh: 60, events: [zonePassed(true)] }),
    ];
    const fineCodes = codes(drive(fine).events);
    const coarseCodes = codes(drive(coarse).events);
    expect(fineCodes).toEqual(["PEDESTRIAN_CROSSING_TOO_FAST", "PEDESTRIAN_NOT_YIELDED"]);
    // THE FILED ASYMMETRY: before the repair this read only NOT_YIELDED —
    // the mobile debrief's 10 т. against PC's 20 for one drive.
    expect(coarseCodes).toEqual(fineCodes);
  });

  it("…and bills the episode once, not once per sampling regime", () => {
    // A fine cadence that already convicted in-zone must not be billed again
    // by the pass-time adjudication.
    const fine = [
      tick(0, { speedKmh: 59, maxSpeedKmh: 60, events: [zoneEntered(true)] }),
      tick(1.5, { speedKmh: 59, maxSpeedKmh: 60 }),
      tick(2.1, { speedKmh: 59, maxSpeedKmh: 60, events: [zonePassed(true)] }),
    ];
    const tooFast = codes(drive(fine).events).filter((c) => c === "PEDESTRIAN_CROSSING_TOO_FAST");
    expect(tooFast).toHaveLength(1);
  });

  it("a sub-sustain flash of speed stays innocent at the pass", () => {
    // The sustain is still the law: onset only 0.5 s before the paint (the
    // pedestrian stepped on late) convicts at NO cadence — the reaction-time
    // grace the sustain encodes must not be repealed by the pass-time check.
    const lateOnset = [
      tick(0, { speedKmh: 59, maxSpeedKmh: 60, events: [zoneEntered(false)] }),
      tick(1.6, { speedKmh: 59, maxSpeedKmh: 60, events: [zoneEntered(true)] }), // ped steps on
      tick(2.1, { speedKmh: 59, maxSpeedKmh: 60, events: [zonePassed(true)] }),
    ];
    expect(codes(drive(lateOnset).events)).toEqual(["PEDESTRIAN_NOT_YIELDED"]);
  });

  it("the A12 braked approach stays silent at coarse cadence too", () => {
    // Enter legally at 45, brake hard, arrive under the approach max: the
    // grace the in-zone clock grants must survive the pass-time adjudication.
    // (A genuinely braking car cannot reach the paint above the max — from
    // 45 км/ч at crossingBrakeResponseMps2 it stops inside the 35 m zone —
    // so the pass-speed gate below is the honest discriminator.)
    const braked = [
      tick(0, { speedKmh: 45, events: [zoneEntered(true)] }),
      tick(2.1, { speedKmh: 28, events: [zonePassed(false)] }),
    ];
    expect(codes(drive(braked).events)).not.toContain("PEDESTRIAN_CROSSING_TOO_FAST");
  });
});
