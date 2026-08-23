import { describe, expect, it } from "vitest";
import { codes, drive, tick } from "./fixtures";
import { DEFAULT_RULE_CONFIG, type SimTick } from "../types";

/**
 * STOPPING FOR A PERSON WAS TAUGHT AS AN OFFENCE.
 *
 * Sweep 161, `sc-hz-accident-scene / pc-right`, frame `04-t092s.png`: a НАУЧИ
 * card reading «Спиране в забранена зона · Спря в участък, в който престоят е
 * забранен — под знак В27 „Забранени са престоят и паркирането“» while a
 * bystander is standing in the car's own lane, on the lesson whose whole
 * subject is that people are standing there («Покрай прясна катастрофа»).
 *
 * The ban-zone detector acquitted every OTHER traffic-shaped rest — a lead
 * within the queue gap, a stop line, a forbidding signal, an armed crossing,
 * reverse gear — and the one it could not acquit was the rest чл. 5, ал. 2
 * cares about most, because `SimTick` carried no measurement of a person at
 * all. `leadGapM` is the VEHICLE ahead, and `hz-accident-v1` ships
 * `crossings: []` on purpose.
 *
 * `SimTick.vruAheadM` is that measurement. These tests pin BOTH halves: the
 * acquittal it buys, and the fact that its ABSENCE changes nothing — every
 * recorded drive and every hand-built tick predates the channel and must grade
 * exactly as it did.
 */

/** Standing still inside an authored В27 span, long enough to be billed. */
const restInBanZone = (over: Partial<SimTick> = {}): SimTick[] =>
  [0, 1, 2, 3, 4, 5, 6].map((t) => tick(t, { speedKmh: 0, noStopZone: true, ...over }));

const billed = (ticks: SimTick[]): boolean =>
  codes(drive(ticks).events).includes("ILLEGAL_STOP_IN_BAN_ZONE");

describe("В27 — the rest that has a person in front of it", () => {
  it("a bare rest under В27 is still convicted (the detector is not switched off)", () => {
    expect(billed(restInBanZone())).toBe(true);
  });

  it("a rest with a person standing in the path is NOT convicted", () => {
    expect(billed(restInBanZone({ vruAheadM: 6 }))).toBe(false);
  });

  it("the acquittal distance is load-bearing: a person 40 m up the street does not excuse a curb stop", () => {
    // The guard on `banZoneVruAheadM`, written as a LITERAL distance on
    // purpose: expressing it as a multiple of the constant would move with any
    // edit to the constant and guard nothing. Someone 40 m away is not why this
    // car is parked, and a channel that acquitted on ANY reported person would
    // switch the В27 rule off wherever the map has pedestrians at all.
    expect(billed(restInBanZone({ vruAheadM: 40 }))).toBe(true);
    // …and the shipped number is the one that makes both halves true: near
    // enough that 40 m is outside it, wide enough that the 6 m bystander of
    // `04-t092s.png` is inside it.
    expect(DEFAULT_RULE_CONFIG.banZoneVruAheadM).toBeGreaterThan(6);
    expect(DEFAULT_RULE_CONFIG.banZoneVruAheadM).toBeLessThan(40);
  });

  it("absence is not innocence: a tick that cannot answer grades exactly as before", () => {
    // Every recorded trace, every fixture and every caller that has not been
    // taught to publish the channel arrives here with the field missing. It
    // must NOT read as „nobody there" and it must NOT read as „someone there".
    expect(billed(restInBanZone({ vruAheadM: undefined }))).toBe(true);
    expect(billed(restInBanZone({ vruAheadM: Number.POSITIVE_INFINITY }))).toBe(true);
    // AND THE DIRECTION THAT ACTUALLY NEEDED THE `Number.isFinite` GUARD (added
    // by the verifier, 2026-08-23). `+Infinity` is refused by the `<= 20`
    // comparison on its own, so the two rows above pass with the finiteness
    // check DELETED — they read as a guard and guard nothing. `-Infinity` and
    // `NaN` are the values that separate the two spellings: `-Infinity <= 20`
    // is TRUE, so a publisher that reported a garbage distance would switch the
    // В27 rule off everywhere it appeared. A channel that can only acquit has
    // to refuse malformed input, not just large input.
    expect(billed(restInBanZone({ vruAheadM: Number.NEGATIVE_INFINITY }))).toBe(true);
    expect(billed(restInBanZone({ vruAheadM: Number.NaN }))).toBe(true);
  });

  it("the person does not license driving on — the channel only ever acquits a REST", () => {
    // Nothing here convicts on `vruAheadM`, and nothing may: a bare distance
    // cannot say whether the duty was to stop. Driving past at speed under В27
    // is not this code's business either way, before or after the channel.
    const rolling = [0, 1, 2, 3, 4, 5, 6].map((t) =>
      tick(t, { speedKmh: 40, noStopZone: true, vruAheadM: 6 }),
    );
    expect(codes(drive(rolling).events)).not.toContain("ILLEGAL_STOP_IN_BAN_ZONE");
  });
});
