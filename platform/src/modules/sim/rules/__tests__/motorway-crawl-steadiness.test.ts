import { describe, expect, it } from "vitest";
import { codes, drive, tick } from "./fixtures";
import { DEFAULT_RULE_CONFIG, type RuleEngineConfig, type SimTick } from "../types";

/**
 * THE CRAWL GATE ASKED A 0.5 m/s² QUESTION OF A 0.04 s DERIVATIVE.
 *
 * `sc-fo-motorway-gap / pc-right` (`.audit-frames/rebase/frames`, HEAD
 * 70bcd1ba, 2026-08-22): 258 s on a 140 км/ч motorway, top speed 15 км/ч, 27
 * full stops, 347 m of carriageway — and the debrief reads «Опасни 0 · Основни
 * 0 · Второстепенни 0 · 0 наказателни точки», on the lesson whose own briefing
 * says «На 130 км/ч изминаваш 36 метра всяка секунда». The map arms everything
 * the detector needs (`content/world/mw-v1.json`: both edges `motorway: true`,
 * `maxspeed` 140, `lanes` 3) and the WRONG leg of the same lesson scores 10, so
 * the reducer was live and the crawl gate specifically was silent.
 *
 * WHY IT COULD BE SILENT. `DRIVING_TOO_SLOW_FOR_MOTORWAY` asks „is this a
 * transition or a chicane" of `accelMps2`, which is measured over
 * `accelWindowSec` — 0.04 s, a length chosen BY THE HARSH-BRAKE CONVICTION
 * (7 m/s² held 0.4 s, where 0.15 s of smoothing already silences two authored
 * panic-brake demos). types.ts prices that derivative's residual at ~0.42 m/s²
 * at 120 fps; the crawl band is 0.5. A small-signal gate was reading a
 * large-signal instrument, and anything that moves the reported speed by a few
 * hundredths of a км/ч per frame — solver jitter, or a beginner pumping the
 * pedal — reads as „accelerating" forever.
 *
 * WHY THE CORPUS NEVER SAW IT, MEASURED. The recorded traces are SCRIPTED and
 * therefore dead flat: on `content/traces/sc-mw-min-speed/mistake-crawl-right
 * .trace.json` (20 Hz, 43 s) 664 of the 813 frames inside the 5–50 км/ч band
 * sit inside the band on the 0.04 s reading. The unit fixtures are flatter
 * still. Replays and tests were green about a gate the live loop could not
 * pass.
 *
 * THE FIX IS ADDITIVE — a SECOND reading of the same question over a second of
 * road (`motorwaySlowSteadyMeanWindowSec`), qualifying a frame that either
 * reading calls steady. It can only add qualifying frames, so nothing that
 * convicted before stops convicting; what it cannot do is call a car steady
 * that is genuinely going somewhere, which is what the merge cases below pin.
 */

const HZ = 60;
const DT = 1 / HZ;

/** A motorway frame: 140 limit, 3-lane bank, curb lane = emergency (laneId 1). */
const mw = (t: number, speedKmh: number, over: Partial<SimTick> = {}) =>
  tick(t, {
    maxSpeedKmh: 140,
    motorway: true,
    emergencyLaneRight: true,
    laneId: 1,
    laneCount: 3,
    speedKmh,
    ...over,
  });

/**
 * Deterministic ±`amplitudeKmh` alternation — the shape of a reported speed
 * that is NOT smooth. Every frame reverses, so over one 0.04 s window (≈2.4
 * frames at 60 Hz) the derivative is |2 × amplitude| / 3.6 / 0.04 m/s², while
 * the mean over any whole number of frames is the underlying trend exactly.
 */
const jitter = (i: number, amplitudeKmh: number) => (i % 2 === 0 ? amplitudeKmh : -amplitudeKmh);

/** `seconds` of motorway at `kmh`, reported with per-frame jitter. */
function jitteryCrawl(seconds: number, kmh: number, amplitudeKmh = 0.35): SimTick[] {
  const out: SimTick[] = [];
  for (let i = 0; i * DT < seconds; i += 1) {
    out.push(mw(i * DT, kmh + jitter(i, amplitudeKmh)));
  }
  return out;
}

const crawlBills = (ticks: SimTick[], cfg?: Partial<RuleEngineConfig>): number =>
  codes(drive(ticks, cfg).events).filter((c) => c === "DRIVING_TOO_SLOW_FOR_MOTORWAY").length;

/** What the 0.04 s reading makes of that jitter — the premise, stated as a number. */
const instantaneousReadingMps2 = (amplitudeKmh: number) =>
  (2 * amplitudeKmh) / 3.6 / DEFAULT_RULE_CONFIG.accelWindowSec;

describe("motorway crawl — a steadiness test the live loop can actually pass", () => {
  it("the premise: 0.35 км/ч of frame-to-frame jitter reads as far more than the crawl band", () => {
    // 0.7 км/ч across 0.04 s ≈ 4.9 m/s² — an order of magnitude over the 0.5
    // band, from a wobble a driver could not feel and a speedometer would not
    // show. This is why the gate needed a second reading and not a wider band:
    // widening the band to swallow this would swallow real merges too.
    expect(instantaneousReadingMps2(0.35)).toBeGreaterThan(
      DEFAULT_RULE_CONFIG.motorwaySlowSteadyMps2 * 5,
    );
  });

  it("books 30 s of jittery 12 км/ч crawl on a 140 км/ч motorway", () => {
    // TWO bills since w11 (MOTORWAY_CRAWL_REGRADE_SEC): the teach and the
    // grade. This file's subject is unchanged — whether the jitter lets the
    // crawl QUALIFY at all — and 0 is still the failing answer.
    expect(crawlBills(jitteryCrawl(30, 12))).toBe(2);
  });

  it("…and it is still not one bill per wobble", () => {
    // 200 s of jitter is thousands of wobbles and exactly two rows.
    expect(crawlBills(jitteryCrawl(200, 12))).toBe(2);
  });

  it("the averaging length is load-bearing: at the shared 0.04 s window the crawl goes unbooked", () => {
    // The guard on the constant. `accelWindowSec` is 0.04 and belongs to the
    // harsh-brake gate; setting the crawl's own window to that length is
    // exactly the state this test was written about, and it must go red.
    expect(crawlBills(jitteryCrawl(200, 12), { motorwaySlowSteadyMeanWindowSec: 0.04 })).toBe(0);
  });

  it("a car with no history is never judged steady on no data — the first second cannot be spent", () => {
    // THE MATURITY CLAUSE, WHICH SHIPPED UNGUARDED (added by the verifier,
    // 2026-08-23). `crawlMeanAccelMps2` is `null` until `t - crawlAnchor.t >=
    // motorwaySlowSteadyMeanWindowSec`, and engine.ts justifies that in prose —
    // „so a car with no history is never judged steady on no data". Nothing
    // tested it: replacing the whole condition with a bare `crawlAnchor !==
    // null` left all 830 tests of `src/modules/sim/rules` GREEN, this file
    // included.
    //
    // WHY IT HID. Before the window has spanned its length the anchor is still
    // frame 0, so the „mean" is a two- or three-frame average — and on this
    // alternation every EVEN frame differences to exactly 0 against frame 0 and
    // reads perfectly steady on no road at all. The shipped 4 s sustain then
    // swallows the difference: both spellings book once, so every count-based
    // assertion above agrees. The first bill's own TIMESTAMP is where it shows,
    // so that is what this measures, with the sustain shortened until a tenth
    // of a second is visible.
    const firstBillAt = (): number | null => {
      const e = drive(jitteryCrawl(6, 12), { motorwaySlowSustainSec: 0.05 }).events.find(
        (x) => x.code === "DRIVING_TOO_SLOW_FOR_MOTORWAY",
      );
      return e ? e.t : null;
    };
    const t0 = firstBillAt();
    // It must still bill — a guard that silenced the crawl would be the defect
    // this file exists about, pointed the other way.
    expect(t0).not.toBeNull();
    // …and not one frame of it may be bought before the second of road it is
    // averaged over actually exists.
    expect(t0 as number).toBeGreaterThanOrEqual(
      DEFAULT_RULE_CONFIG.motorwaySlowSteadyMeanWindowSec,
    );
  });

  it("a jittery MERGE is still innocent — the second reading averages the trend, not the wobble", () => {
    // 0 → 130 км/ч at ~2.5 m/s², reported with the same jitter. The mean over a
    // second is 2.5 m/s², five times the band, so every frame of the climb is
    // still a transition. A fix that bought the crawl by loosening the gate
    // would convict this.
    const ticks: SimTick[] = [];
    for (let i = 0; i * DT < 20; i += 1) {
      const trend = Math.min(130, i * DT * 9);
      ticks.push(mw(i * DT, trend + (trend > 1 ? jitter(i, 0.35) : 0)));
    }
    expect(crawlBills(ticks)).toBe(0);
  });

  it("a jittery crawl BEHIND A LEAD is still innocent — congestion is a cause", () => {
    expect(crawlBills(jitteryCrawl(200, 12).map((f) => ({ ...f, leadGapM: 18 })))).toBe(0);
  });

  it("a jittery crawl on an ordinary street is still innocent — no motorway, no rule", () => {
    expect(
      crawlBills(jitteryCrawl(200, 12).map((f) => ({ ...f, motorway: undefined, maxSpeedKmh: 50 }))),
    ).toBe(0);
  });

  it("the flow floor is load-bearing: a jittery 60 км/ч is above it and books nothing", () => {
    expect(crawlBills(jitteryCrawl(200, 60))).toBe(0);
  });
});
