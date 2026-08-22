import { existsSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { beforeEach, describe, expect, it } from "vitest";
// The namespace import is not decoration: the PRIME_DT_SEC guard below
// reflects over it to prove that no ramp rate escaped WEATHER_RATES, and the
// routing guard at the foot of this file asks it whether the snow-bearing
// road mapping exists at all before it demands that mapping be routed.
import * as weatherModule from "../weather";
import {
  FOG_IN_PER_SEC,
  FOG_OUT_PER_SEC,
  PRIME_DT_SEC,
  RAIN_IN_PER_SEC,
  RAIN_OUT_PER_SEC,
  SLOWEST_TRAVERSE_SEC,
  SNOW_IN_PER_SEC,
  SNOW_OUT_PER_SEC,
  SNOW_ROAD_BRIGHTEN,
  WEATHER_RATES,
  WETNESS_IN_PER_SEC,
  WETNESS_OUT_PER_SEC,
  getFogIntensity,
  getRainIntensity,
  getSnowIntensity,
  getWetness,
  primeWeather,
  resetWeather,
  roadSurfaceToParams,
  setWeatherTarget,
  stepWeather,
  wetnessToRoadParams,
} from "../weather";

function run(seconds: number, dt = 1 / 60): void {
  const steps = Math.round(seconds / dt);
  for (let i = 0; i < steps; i++) stepWeather(dt);
}

/** Every channel at once — the shape the „did anything else move?" assertions
 *  compare, so a leak into a channel nobody named cannot hide behind a test
 *  that only looked at the channel it set. */
function channels(): { wetness: number; rain: number; fog: number; snow: number } {
  return {
    wetness: getWetness(),
    rain: getRainIntensity(),
    fog: getFogIntensity(),
    snow: getSnowIntensity(),
  };
}

describe("weather channel", () => {
  beforeEach(() => resetWeather());

  it("starts bone dry", () => {
    expect(getWetness()).toBe(0);
    expect(getRainIntensity()).toBe(0);
  });

  it("ramps wetness at the documented rate while raining", () => {
    setWeatherTarget(true, false, false);
    run(1);
    expect(getWetness()).toBeCloseTo(WETNESS_IN_PER_SEC, 2);
    run(1 / WETNESS_IN_PER_SEC); // more than enough to saturate
    expect(getWetness()).toBe(1);
  });

  it("rain intensity leads wetness (clouds before puddles)", () => {
    setWeatherTarget(true, false, false);
    run(1);
    expect(getRainIntensity()).toBeCloseTo(RAIN_IN_PER_SEC, 2);
    expect(getRainIntensity()).toBeGreaterThan(getWetness());
  });

  it("dries out slower than it soaks (asymmetric rates)", () => {
    expect(WETNESS_OUT_PER_SEC).toBeLessThan(WETNESS_IN_PER_SEC);
    setWeatherTarget(true, false, false);
    run(6); // fully wet
    setWeatherTarget(false, false, false);
    run(1);
    expect(getWetness()).toBeCloseTo(1 - WETNESS_OUT_PER_SEC, 2);
    run(1 / WETNESS_OUT_PER_SEC);
    expect(getWetness()).toBe(0);
  });

  it("stays clamped to 0..1 under huge steps", () => {
    setWeatherTarget(true, false, false);
    stepWeather(999);
    expect(getWetness()).toBe(1);
    expect(getRainIntensity()).toBe(1);
    setWeatherTarget(false, false, false);
    stepWeather(999);
    expect(getWetness()).toBe(0);
  });

  it("ignores non-positive dt", () => {
    setWeatherTarget(true, false, false);
    stepWeather(0);
    stepWeather(-1);
    expect(getWetness()).toBe(0);
  });

  it("FOG channel: ramps at the documented rate, independent of rain/wetness", () => {
    setWeatherTarget(false, true, false);
    run(1);
    expect(getFogIntensity()).toBeCloseTo(FOG_IN_PER_SEC, 2);
    // Fog does NOT wet the road and brings no rain.
    expect(getWetness()).toBe(0);
    expect(getRainIntensity()).toBe(0);
    run(1 / FOG_IN_PER_SEC); // more than enough to saturate
    expect(getFogIntensity()).toBe(1);
    // Clearing the fog flag lifts the bank.
    setWeatherTarget(false, false, false);
    stepWeather(999);
    expect(getFogIntensity()).toBe(0);
  });

  it("FOG channel: clamps and resets like the rain channels", () => {
    setWeatherTarget(true, true, false);
    stepWeather(999);
    expect(getFogIntensity()).toBe(1);
    expect(getRainIntensity()).toBe(1);
    resetWeather();
    expect(getFogIntensity()).toBe(0);
  });

  it("SNOW channel: ramps at the documented rate, independent of rain/fog/wetness", () => {
    setWeatherTarget(false, false, true);
    run(1);
    expect(getSnowIntensity()).toBeCloseTo(SNOW_IN_PER_SEC, 2);
    // Snow does NOT wet the road (the honest scope cut) and brings no rain/fog.
    expect(getWetness()).toBe(0);
    expect(getRainIntensity()).toBe(0);
    expect(getFogIntensity()).toBe(0);
    run(1 / SNOW_IN_PER_SEC); // more than enough to saturate
    expect(getSnowIntensity()).toBe(1);
    // Clearing the snow flag stops the snowfall.
    setWeatherTarget(false, false, false);
    stepWeather(999);
    expect(getSnowIntensity()).toBe(0);
  });

  it("SNOW channel: clamps and resets like the other channels", () => {
    setWeatherTarget(true, false, true);
    stepWeather(999);
    expect(getSnowIntensity()).toBe(1);
    expect(getRainIntensity()).toBe(1);
    resetWeather();
    expect(getSnowIntensity()).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// THE RAMP GRAMMAR — the eight rates state a weather ORDER, and five of them
// were free to violate it
//
// MEASURED 2026-08-22 by mutating weather.ts one constant at a time and
// running this file (30 mutants). Nine survived; five of them were ramp rates:
// RAIN_OUT, FOG_IN, FOG_OUT, SNOW_IN and SNOW_OUT could each be set to any
// value at all and every test here stayed green. The reason is structural
// rather than careless — the per-channel ramp tests above assert that the
// store ramps at whatever the constant SAYS (`toBeCloseTo(FOG_IN_PER_SEC)`),
// which is a true and useful claim about the store and no claim at all about
// the constant. So the header's weather grammar — „fog banks roll in, they
// don't switch", „weather fronts arrive", „puddles outlive the shower",
// „snow … slowest of the three channels" — was four hundred words of
// justification with nothing underneath it, the exact shape this programme
// keeps paying for.
//
// WHAT THE ORDER IS FOR, so the assertions are not arithmetic for its own
// sake. These rates are what a TRANSITION looks like, and a transition is the
// one moment the picture and the graded tick can disagree: `tick.rain/fog/snow`
// are booleans, true on frame 1, while these channels ramp. `primeWeather`
// removes that disagreement at a scene boundary; inside a scene the ramp is
// the student's only cue that the conditions changed under them, and its SHAPE
// is the teaching. Rain arrives like a switch because a shower does. Fog does
// not, and a fog that snapped on would tell a seventeen-year-old that reduced
// visibility announces itself. Snow is slower still, in both directions,
// because a snow front neither arrives nor leaves in the time a shower does.
//
// WHAT THIS PINS AND WHAT IT DOES NOT — stated because the mutation run says
// so, not to excuse the gap. These assertions fix each channel's PLACE in the
// order; they do not fix any rate's absolute magnitude. SNOW_IN_PER_SEC set to
// 1/9 or 1/90 is still the slowest and still passes. That is deliberate: no
// evidence in this repo says snow must arrive in six seconds rather than nine,
// and inventing a bound to redden a mutant is decoration. The magnitude is
// bounded WHERE IT MATTERS instead — `SLOWEST_TRAVERSE_SEC` is derived from
// this very registry, so a slower channel automatically lengthens
// `PRIME_DT_SEC` and no scene can open partway through its ramp however slow
// somebody makes it. That is what the derivation buys, and the test below is
// what stops the derivation being spent.
// ---------------------------------------------------------------------------

describe("the ramp grammar the header states is the one the rates obey", () => {
  it("PUDDLES OUTLIVE THE SHOWER: wetness drains slower than it soaks", () => {
    // The one leg of the grammar that already had a guard (the asymmetry test
    // above asserts it too); restated here so the whole order reads in one
    // place and no leg can be dropped by deleting the block that owns it.
    expect(WETNESS_OUT_PER_SEC).toBeLessThan(WETNESS_IN_PER_SEC);
  });

  it("RAIN IS A SWITCH, WETNESS IS A STATE: the rain channel leads in both directions", () => {
    // „rainIntensity — how hard it is raining *right now* … Faster in/out than
    // wetness." Clouds and streaks change with the shower; the road they
    // soaked does not.
    expect(RAIN_IN_PER_SEC).toBeGreaterThan(WETNESS_IN_PER_SEC);
    expect(RAIN_OUT_PER_SEC).toBeGreaterThan(WETNESS_OUT_PER_SEC);
  });

  it("FOG BANKS ROLL IN, THEY DO NOT SWITCH: fog is slower than rain both ways", () => {
    // Mutation that reddens this: RAIN_OUT_PER_SEC 1/3 → 1/9 (a survivor of
    // the 2026-08-22 run) makes the rain clear slower than the fog lifts.
    expect(FOG_IN_PER_SEC).toBeLessThan(RAIN_IN_PER_SEC);
    expect(FOG_OUT_PER_SEC).toBeLessThan(RAIN_OUT_PER_SEC);
  });

  it("SNOW IS THE SLOWEST FRONT: it arrives after the fog and clears after it too", () => {
    // Both survivors of the mutation run land here: FOG_IN 1/5 → 1/9 makes the
    // fog arrive slower than the snow, and FOG_OUT 1/6 → 1/9 makes it lift
    // slower than the snow clears. Either one inverts the header's «slowest of
    // the three channels» while leaving every behavioural test green.
    expect(SNOW_IN_PER_SEC).toBeLessThan(FOG_IN_PER_SEC);
    expect(SNOW_OUT_PER_SEC).toBeLessThan(FOG_OUT_PER_SEC);
  });

  it("the order is TOTAL: snow ≤ fog ≤ rain on arrival, and the same on clearing", () => {
    // The chain as one statement, so a future channel inserted in the middle
    // has to declare where it sits rather than quietly straddling two rungs.
    // Written as a formatted string on purpose: a bare `toBeLessThan` chain
    // reports „expected 0.111 to be less than 0.2" and names neither constant.
    const arriving = ["SNOW_IN", "FOG_IN", "RAIN_IN"] as const;
    const clearing = ["SNOW_OUT", "FOG_OUT", "RAIN_OUT"] as const;
    const rate = (n: string): number => WEATHER_RATES[`${n}_PER_SEC` as keyof typeof WEATHER_RATES];
    for (const order of [arriving, clearing]) {
      for (let i = 1; i < order.length; i++) {
        const slower = order[i - 1];
        const faster = order[i];
        expect(`${slower} slower than ${faster}: ${rate(slower) < rate(faster)}`).toBe(
          `${slower} slower than ${faster}: true`,
        );
      }
    }
  });
});

// ---------------------------------------------------------------------------
// NO CHANNEL IS CLEARED BY A CALLER THAT DID NOT NAME IT
//
// The store is a module-level singleton with three writers. `fog` and `snow`
// shipped as defaulted trailing parameters so the callers that predated them
// stayed byte-identical, and the previous version of this file asserted that
// default as a FEATURE („the additive API"): `setWeatherTarget(false)` was
// tested to clear the fog. It is not additive — it is destructive, and it is
// the mechanism by which a rendered condition vanishes from a lesson without
// anyone getting an error, which is the shape of every sweep161 finding on
// this file. The parameters are now required, so the compiler is the guard;
// what stays testable at runtime is the pair of directions.
// ---------------------------------------------------------------------------

describe("weather channel: a named channel survives, an unnamed one is a type error", () => {
  beforeEach(() => resetWeather());

  it("SILENT CLEAR IS UNTYPEABLE: every channel must be named at the call site", () => {
    // @ts-expect-error — `setWeatherTarget(true)` used to compile and meant
    // „rain, AND stop the snow, AND lift the fog". Restoring the defaults on
    // setWeatherTarget makes this directive unused and turns tsc red.
    expect(() => setWeatherTarget(true)).not.toThrow();
    // @ts-expect-error — two arguments is the same hazard one channel later.
    expect(() => setWeatherTarget(true, true)).not.toThrow();
  });

  it("DIRECTION 1 — a channel the caller keeps asserting is NOT disturbed", () => {
    setWeatherTarget(false, false, true);
    stepWeather(999);
    expect(getSnowIntensity()).toBe(1);
    // Rain starts while the snow is still authored: the snow must hold at 1.
    setWeatherTarget(true, false, true);
    run(4);
    expect(getSnowIntensity()).toBe(1);
    expect(getRainIntensity()).toBeGreaterThan(0);
  });

  it("DIRECTION 2 — a channel the caller drops DOES clear (no stuck weather)", () => {
    setWeatherTarget(false, false, true);
    stepWeather(999);
    expect(getSnowIntensity()).toBe(1);
    // Same call, snow dropped: it must decay, not stick. A guard that only
    // proved direction 1 would be satisfied by a store that ignores the flag.
    setWeatherTarget(true, false, false);
    run(1);
    expect(getSnowIntensity()).toBeLessThan(1);
    stepWeather(999);
    expect(getSnowIntensity()).toBe(0);
  });

  it("the four channels are mutually independent under a full sweep", () => {
    // Each channel driven alone leaves the other three untouched — the leak a
    // shared `approach` over shared scratch would produce.
    const only = (
      rain: boolean,
      fog: boolean,
      snow: boolean,
    ): ReturnType<typeof channels> => {
      resetWeather();
      setWeatherTarget(rain, fog, snow);
      stepWeather(999);
      return channels();
    };
    expect(only(true, false, false)).toEqual({ wetness: 1, rain: 1, fog: 0, snow: 0 });
    expect(only(false, true, false)).toEqual({ wetness: 0, rain: 0, fog: 1, snow: 0 });
    expect(only(false, false, true)).toEqual({ wetness: 0, rain: 0, fog: 0, snow: 1 });
    expect(only(true, true, true)).toEqual({ wetness: 1, rain: 1, fog: 1, snow: 1 });
  });
});

// ---------------------------------------------------------------------------
// primeWeather — a lesson's weather is a STANDING CONDITION, not an event
//
// sc-ac-snow is not a clear street where it begins to snow; it is a snowy
// street. The channels nevertheless start at 0 and ramp (snow saturates in
// ~6 s), and nothing in the live path ever resets this singleton between
// lessons — so the first frame of a weather lesson is a clear-weather frame,
// and a lesson opened after another one inherits its weather for as long as
// the ramp-down takes. The clip-capture dev route hit exactly this in the
// founder's round-3 review and answered it by hand-rolling the sequence;
// this is that sequence, owned by the state it primes.
//
// The pair below is deliberate: „does not inherit" alone would be satisfied by
// a store that snapped on every setWeatherTarget and could not ramp at all,
// so „the leak it prevents is real" asserts the ramp still exists. Mutation
// run: snapping inside setWeatherTarget passes the first and fails the second.
// ---------------------------------------------------------------------------

describe("primeWeather: settle on frame 1", () => {
  beforeEach(() => resetWeather());

  it("lands on the steady state in ONE call, with no ramp left to run", () => {
    primeWeather(false, false, true);
    expect(channels()).toEqual({ wetness: 0, rain: 0, fog: 0, snow: 1 });
    // Already at target: further stepping must not move it (the „SimEnvironment
    // then holds it, already at target" half of the contract).
    run(3);
    expect(channels()).toEqual({ wetness: 0, rain: 0, fog: 0, snow: 1 });
  });

  it("PRIME_DT_SEC outruns EVERY rate, and no rate escapes the registry", () => {
    // THE SELF-CHECK COMES FIRST, because the loop under it is only worth
    // anything if WEATHER_RATES really lists every rate. The guard this
    // replaces named WETNESS_OUT_PER_SEC as „the slowest" in a comment — true
    // when written, and silently false the day anyone adds a slower channel,
    // at which point primed scenes would open partway through their ramp with
    // nothing going red. Reflecting over the module's own exports makes the
    // omission itself the failure.
    const exportedRates = Object.keys(weatherModule).filter((k) => k.endsWith("_PER_SEC"));
    expect(exportedRates.length).toBeGreaterThan(0);
    expect(new Set(exportedRates)).toEqual(new Set(Object.keys(WEATHER_RATES)));
    for (const [name, rate] of Object.entries(WEATHER_RATES)) {
      expect(`${name}:${PRIME_DT_SEC > 1 / rate}`).toBe(`${name}:true`);
    }
    // And the margin is not cosmetic: `approach` clamps at the target, so ONE
    // full traverse looks sufficient — but (1/12)*12 === 0.9999999999999999,
    // so a step of exactly 12 s leaves wetness at ~1.1e-16. That residue
    // quantizes to 0, so the React hooks never see it, while getWetness() —
    // what the per-frame road material reads — stays non-zero and a primed
    // dry scene renders imperceptibly damp forever. `toBe(0)` is deliberate
    // over `toBeCloseTo`: it is the residue that is being excluded.
    setWeatherTarget(true, false, false);
    stepWeather(999);
    primeWeather(false, false, false);
    expect(channels()).toEqual({ wetness: 0, rain: 0, fog: 0, snow: 0 });
  });

  it("PRIME_DT_SEC IS DERIVED FROM THE RATES, not a literal that happens to be big enough", () => {
    // THE MUTANT THIS EXISTS FOR, and it is the file's own history: replacing
    // `2 * SLOWEST_TRAVERSE_SEC` with the hand-written `20` that used to stand
    // here left every test in this file GREEN (mutation run, 2026-08-22). The
    // store's header spends eight lines convicting exactly that spelling —
    // „true when it was written, and silently false the moment anyone adds a
    // slower channel" — and nothing underneath the prose could tell the two
    // apart, because 20 outruns today's slowest traverse of 12 s and the
    // assertions above only ask whether it outruns TODAY's.
    //
    // Both existing guards miss it for the same reason. `PRIME_DT_SEC > 1/rate`
    // is satisfied by any literal above 12. The exact-landing check is
    // satisfied by any literal far enough past 12 to swallow the float residue
    // (a literal 20 leaves wetness at 0, not at 1.1e-16). So the only failable
    // form of „derived" is the RATIO to the registry's own slowest traverse.
    //
    // NOT A CHANGE DETECTOR: any margin of two or more passes, so an author
    // who deliberately widens it to 3× is not stopped.
    //
    // EXACTLY WHAT THIS CATCHES, verified by running each mutant rather than
    // reasoned — the first draft of this comment claimed more than the
    // assertion delivers, which is the same crime as the prose it replaces:
    //   · `PRIME_DT_SEC = 20`  → RED (ratio 1.67). The historical literal.
    //   · a slower channel added while PRIME_DT_SEC stays a literal → RED,
    //     because SLOWEST_TRAVERSE_SEC rises underneath it. THIS is the
    //     failure the derivation exists to prevent.
    //   · `PRIME_DT_SEC = 1000` → GREEN, and honestly so: it is undocumented
    //     but it is not wrong, and it only goes stale for a channel slower
    //     than 500 s. Nothing here can tell a large literal from a derivation.
    // The second assertion has the same shape and the same limit: it convicts
    // a traverse that disagrees with the registry, and a literal `12` — today's
    // max, written out — passes it. From node there is no way to ask whether an
    // expression was derived; only whether it still agrees with its inputs.
    expect(SLOWEST_TRAVERSE_SEC).toBe(Math.max(...Object.values(WEATHER_RATES).map((r) => 1 / r)));
    expect(PRIME_DT_SEC / SLOWEST_TRAVERSE_SEC).toBeGreaterThanOrEqual(2);
  });

  it("does not inherit the PREVIOUS scene's weather (the cross-lesson leak)", () => {
    // Lesson 1: snow, fully settled.
    primeWeather(false, false, true);
    expect(getSnowIntensity()).toBe(1);
    // Lesson 2 is sc-ac-ice — authored `weather: "dry"`. Its FIRST frame must
    // be dry. Plain setWeatherTarget leaves the snow haze up for ~8 s, which
    // is what the live path does today; priming is what makes frame 1 honest.
    primeWeather(false, false, false);
    expect(channels()).toEqual({ wetness: 0, rain: 0, fog: 0, snow: 0 });
  });

  it("the leak it prevents is real: plain setWeatherTarget carries weather over", () => {
    // The mirror of the assertion above — without it, the previous test would
    // be satisfied by a store that could not hold weather at all.
    primeWeather(false, false, true);
    setWeatherTarget(false, false, false);
    run(1);
    expect(getSnowIntensity()).toBeGreaterThan(0.5);
  });

  // -------------------------------------------------------------------------
  // WHAT THE STUDENT SEES ON FRAME 1 IS WHAT THE ENGINE GRADES ON FRAME 1
  //
  // The lane's whole tiebreak in one assertion. `lesson.environment.{rain,fog,
  // snow}` feeds two consumers: this store (through SimEnvironment) and the
  // tick the rule engine grades on (`tick.rain/fog/snow` →
  // conditionSpeed*Factor). The tick's flags are BOOLEANS and true from t=0.
  // This store's are ramps from 0 that outlive a scene. Every second those two
  // disagree, the engine is holding the student to a snowy street's speed
  // envelope over a picture of a clear one — a false failure — or grading a
  // wet lesson dry because the previous lesson's rain has not drained.
  //
  // The two loops are the two directions the lane rules demand, and neither
  // alone is sufficient: „arrives full" alone is satisfied by a store that
  // snaps and can never ramp; „leaves nothing behind" alone is satisfied by a
  // store that renders no weather at all.
  // -------------------------------------------------------------------------
  const EIGHT: ReadonlyArray<[boolean, boolean, boolean]> = [
    [false, false, false],
    [true, false, false],
    [false, true, false],
    [false, false, true],
    [true, true, false],
    [true, false, true],
    [false, true, true],
    [true, true, true],
  ];
  const asGraded = (rain: boolean, fog: boolean, snow: boolean) => ({
    wetness: rain ? 1 : 0,
    rain: rain ? 1 : 0,
    fog: fog ? 1 : 0,
    snow: snow ? 1 : 0,
  });

  it("ARRIVES FULL: every authored combination renders at its graded strength on frame 1", () => {
    for (const [rain, fog, snow] of EIGHT) {
      resetWeather();
      primeWeather(rain, fog, snow);
      expect({ combo: [rain, fog, snow], ch: channels() }).toEqual({
        combo: [rain, fog, snow],
        ch: asGraded(rain, fog, snow),
      });
    }
  });

  it("LEAVES NOTHING BEHIND: no ordered pair of lessons leaks weather across the boundary", () => {
    // No resetWeather between them — that is the point. The store is a module
    // singleton and the live path never resets it; the second lesson's first
    // frame has to be its own weather with the first lesson's still standing.
    for (const prev of EIGHT) {
      for (const next of EIGHT) {
        resetWeather();
        primeWeather(...prev);
        primeWeather(...next);
        expect({ prev, next, ch: channels() }).toEqual({
          prev,
          next,
          ch: asGraded(...next),
        });
      }
    }
  });
});

describe("wetnessToRoadParams", () => {
  it("dry road: rough, undarkened", () => {
    const p = wetnessToRoadParams(0);
    expect(p.roughness).toBeCloseTo(0.92, 5);
    expect(p.darken).toBe(1);
  });

  it("soaked road: glossy and darkened", () => {
    const p = wetnessToRoadParams(1);
    expect(p.roughness).toBeCloseTo(0.42, 5);
    expect(p.darken).toBeCloseTo(0.62, 5);
  });

  it("interpolates monotonically and clamps out-of-range wetness", () => {
    const a = wetnessToRoadParams(0.25);
    const b = wetnessToRoadParams(0.75);
    expect(b.roughness).toBeLessThan(a.roughness);
    expect(b.darken).toBeLessThan(a.darken);
    expect(wetnessToRoadParams(-1)).toEqual(wetnessToRoadParams(0));
    expect(wetnessToRoadParams(2)).toEqual(wetnessToRoadParams(1));
  });

  it("honors custom material bounds", () => {
    const p = wetnessToRoadParams(1, { wetRoughness: 0.3, wetDarken: 0.5 });
    expect(p.roughness).toBeCloseTo(0.3, 5);
    expect(p.darken).toBeCloseTo(0.5, 5);
  });

});

// ---------------------------------------------------------------------------
// roadSurfaceToParams — sc-ac-snow part A, the half that lives in this file
//
// „The briefing states the road is snow-covered … but the road is bare grey
// asphalt with clean white lane markings … The student is being taught winter
// grip on a picture of a dry summer street." (critical; confirmed by eye on
// sweep161/sc-ac-snow/pc-right/03-ready.png beside sc-ac-fog's — same asphalt,
// same haze, same light.)
//
// The assertion this block replaces was
// `expect(wetnessToRoadParams(getWetness())).toEqual(wetnessToRoadParams(0))`
// under the title „carries no snow/ice term". getWetness() is 0 in a snow
// scene, so it compared f(0) with f(0): UN-FAILABLE. It could not have gone
// red for any implementation of anything, including the fixed one — a test
// that pins a defect has to be written so that REMOVING the defect breaks it,
// and that one stayed green either way.
//
// THAT CRITIQUE WAS RIGHT ABOUT THE BODY AND WRONG ABOUT THE ASSERTION, and
// the difference is what this file got wrong on the way through. The deleted
// test carried a docblock: „a snow term added here must arrive together with
// its StaticWorld reader, or this assertion is the thing that goes red." That
// is a SPECIFICATION, and it is the correct one — the failure mode it names
// is the one that then happened. Its body simply never implemented it. So the
// lane that shipped the snow term met a guard whose stated purpose was to
// catch precisely that shipment, found the body toothless, and deleted the
// specification along with it — then replaced it with an assertion that the
// road under full snow equals the dry road. A guard deleted by the very change
// it existed to catch, and a defect written down as the expected result.
//
// The specification is restored at the foot of this file, with the body it
// always needed. It WAS red until the two-file routing landed (ed2dd6f); it
// has been green since, and the mutation test beside the guard cuts each leg
// back out of the real sources so that green is load-bearing rather than
// vacuous. This sentence still read „It is RED until the two-file routing
// lands" long after the routing shipped — the identical stale-note defect the
// store's header note 2 convicts, sitting four hundred lines from the note
// that convicts it. Corrected 2026-08-23 by the verifier.
// ---------------------------------------------------------------------------

/**
 * The mapping EXACTLY as it shipped before the snow term, inlined on purpose.
 * The back-compatibility claim is „no dry and no rain lesson moved a pixel",
 * and comparing the new function against itself would be circular — it can
 * only be proved against the old arithmetic.
 */
function shippedRainOnlyParams(
  w: number,
  opts?: { dryRoughness?: number; wetRoughness?: number; wetDarken?: number },
) {
  const dryRoughness = opts?.dryRoughness ?? 0.92;
  const wetRoughness = opts?.wetRoughness ?? 0.42;
  const wetDarken = opts?.wetDarken ?? 0.62;
  const t = w < 0 ? 0 : w > 1 ? 1 : w;
  return {
    roughness: dryRoughness + (wetRoughness - dryRoughness) * t,
    darken: 1 + (wetDarken - 1) * t,
  };
}

/** The three opts bags StaticWorld actually ships (road, decals, paint), plus
 *  the bare defaults. Byte-identity is claimed for the CALL SITES, so it is
 *  tested at them and not at some tidier invented set. */
const SHIPPED_OPTS = [
  undefined,
  { dryRoughness: 1.0, wetRoughness: 0.5, wetDarken: 0.6 },
  { dryRoughness: 0.95, wetRoughness: 0.45, wetDarken: 0.6 },
  { dryRoughness: 0.85, wetRoughness: 0.4, wetDarken: 0.78 },
] as const;

describe("roadSurfaceToParams: the road can finally tell snow from dry", () => {
  it("DIRECTION 1 — a snow-covered road does NOT render as a dry one", () => {
    const dry = roadSurfaceToParams({ wet: 0, snow: 0 });
    const snowy = roadSurfaceToParams({ wet: 0, snow: 1 });
    expect(snowy).not.toEqual(dry);
    // Specifically: it BRIGHTENS. The audit measured sc-ac-snow's carriageway
    // at mean sRGB L 82.6 near / 135.5 far against sc-ac-fog's 84.8 / 148.6 —
    // snow rendering DARKER than fog, the wrong way round for a street with
    // snow lying on it. `darken` is a multiply on the road albedo, so the fix
    // is the one channel in RoadWetnessParams that may exceed 1.
    expect(snowy.darken).toBeGreaterThan(1);
    expect(snowy.darken).toBe(SNOW_ROAD_BRIGHTEN);
  });

  it("DIRECTION 2 — snow costs every dry and rain lesson exactly nothing", () => {
    // The false-certificate mirror. A snow term that also nudged the 46 rain
    // lessons and every dry one would be „fixed the picture" bought with a
    // silent retune of scenes whose look was measured and signed off (the R5
    // wet-gloss round, doc 66). Byte-identical means byte-identical: `toBe`
    // on each number, over the shipped call sites, across the whole range
    // plus the out-of-range values the clamp has to absorb.
    const sweep = [-1, -0.001, 0, 0.01, 0.25, 0.5, 0.75, 0.99, 1, 1.001, 2];
    for (const opts of SHIPPED_OPTS) {
      for (const w of sweep) {
        const expected = shippedRainOnlyParams(w, opts);
        const viaSurface = roadSurfaceToParams({ wet: w, snow: 0 }, opts);
        const viaLegacy = wetnessToRoadParams(w, opts);
        expect(`${w}/${viaSurface.roughness}`).toBe(`${w}/${expected.roughness}`);
        expect(`${w}/${viaSurface.darken}`).toBe(`${w}/${expected.darken}`);
        expect(`${w}/${viaLegacy.roughness}`).toBe(`${w}/${expected.roughness}`);
        expect(`${w}/${viaLegacy.darken}`).toBe(`${w}/${expected.darken}`);
      }
    }
  });

  it("the three surfaces are ORDERED and SEPARATED: wet < dry < snow", () => {
    // This assertion was first written as `snowy.darken > soaked.darken`, and
    // the mutation run caught it: a dry road (1) is already brighter than a
    // wet one (0.6), so it stayed green with the snow term deleted outright
    // AND with SNOW_ROAD_BRIGHTEN set to 0.9. It asserted its title and
    // guarded nothing. Two things were wrong with it, and both are fixed here.
    //
    // First, the chain has to include DRY — „not darker than wet" is trivially
    // true of a road that ignores snow completely.
    //
    // Second, strict-greater is the wrong test for this defect. The audit did
    // not measure „snow looks wrong"; it measured snow and fog landing within
    // a few percent of each other on every channel — two conditions a student
    // cannot tell apart. A chain that held by 1e-16 would satisfy the letter
    // of the claim and still render one single street. So each step has to
    // clear a margin a person can see.
    //
    // THE SNOW FLOOR WAS 0.15 AND ITS JUSTIFICATION DID NOT REPRODUCE. The
    // sentence that stood here read „0.15 on an albedo multiply is ~15%, five
    // times the ~3% the audit called indistinguishable". `darken` is not a
    // screen percentage — it is a multiply into the road albedo, which is then
    // tinted (ROAD_ALBEDO_TINT 0.72), lit, hazed and tone-mapped before a
    // student sees it, and every one of those compresses it.
    //
    // MEASURED 2026-08-22 on the re-drive at HEAD, in the audit's own near-road
    // rectangle (620,500 120×30) on the two lessons that share `ac-rain-v1` and
    // the DAY preset, so the only difference is the weather:
    //
    //                  sweep161 (before the term)   rebase (after, 1.8 shipped)
    //   sc-ac-snow     mean sRGB L 83.1              L 106.9
    //   sc-ac-fog      L 85.3                        L 86.8    ← the control
    //
    // The full 0.8 multiply bought +28.6% on screen while the fog control drifted
    // +1.8% across the same two builds, so the renderer compresses this
    // multiply by roughly 2.8× in the near field. The old floor of 0.15
    // therefore buys about 4.3% on screen — 1.4× the band the audit called
    // indistinguishable, not five times it. It would have passed
    // SNOW_ROAD_BRIGHTEN = 1.16, and the mutation run confirms it did.
    //
    // The floor is set to deliver what that sentence promised: 5 × 3% = 15% on
    // screen, ÷ 2.8 ≈ 0.53 of `darken`, rounded to 0.5. Shipped 1.8 clears it
    // with 60% to spare; 1.16 goes red. TWO HONEST LIMITS on that arithmetic:
    // it comes from ONE rectangle (the one whose control drifted least), and
    // the far field compresses harder still (the same pair of frames gives
    // +11% at 830,395), so 0.5 is a NEAR-FIELD floor and the far field is
    // weather.ts's haze problem, not this mapping's.
    //
    // THE WET FLOOR IS LEFT AT 0.15 AND IS NOT THE SAME NUMBER. ONE of the
    // shipped opts bags separates dry from soaked by only 0.22 (wetDarken 0.78,
    // the paint bag; the other three are 0.38, 0.40 and 0.40 — this line said
    // „Two" until it was counted, 2026-08-23), so one shared constant cannot
    // carry both: a 0.5 floor applied to the wet leg would redden the shipped
    // paint bag on the spot. And the wet
    // look was measured and signed off in the doc-66 R5 round, so raising its
    // floor here would be retuning a scene by assertion.
    const WET_MIN_SEPARATION = 0.15;
    const SNOW_MIN_SEPARATION = 0.5;
    for (const opts of SHIPPED_OPTS) {
      const soaked = roadSurfaceToParams({ wet: 1, snow: 0 }, opts);
      const dry = roadSurfaceToParams({ wet: 0, snow: 0 }, opts);
      const snowy = roadSurfaceToParams({ wet: 0, snow: 1 }, opts);
      expect(dry.darken - soaked.darken).toBeGreaterThan(WET_MIN_SEPARATION);
      expect(snowy.darken - dry.darken).toBeGreaterThan(SNOW_MIN_SEPARATION);
    }
  });

  it("snow UN-glosses: it lands on top of the water, and returns the road to matte", () => {
    // Ordering claim — snow is the last thing to reach the surface, so at
    // full cover the wet gloss underneath must be gone entirely, not averaged
    // with it. A slush road that stayed mirror-glossy would read as rain.
    const opts = { dryRoughness: 1.0, wetRoughness: 0.5, wetDarken: 0.6 };
    const soaked = roadSurfaceToParams({ wet: 1, snow: 0 }, opts);
    const snowOverSoaked = roadSurfaceToParams({ wet: 1, snow: 1 }, opts);
    const snowOverDry = roadSurfaceToParams({ wet: 0, snow: 1 }, opts);
    expect(soaked.roughness).toBe(0.5);
    // Roughness lands exactly; darken carries a 1-ulp residue from the nested
    // lerp (1.8000000000000003 vs 1.8), so it is compared to 12 places rather
    // than pretended to be exact. The residue is ~2e-16 and the defect this
    // guards against — water surviving under full snow — is worth 1.2, six
    // orders of magnitude clear of the tolerance. Byte-exactness is claimed
    // and tested only where it is load-bearing, at `snow: 0`.
    expect(snowOverSoaked.roughness).toBe(snowOverDry.roughness);
    expect(snowOverSoaked.darken).toBeCloseTo(snowOverDry.darken, 12);
    // Default snowRoughness is the CALLER's dryRoughness, so each of the three
    // StaticWorld surfaces keeps its own character under snow rather than
    // collapsing onto a number invented in this file.
    expect(roadSurfaceToParams({ wet: 1, snow: 1 }, SHIPPED_OPTS[3]).roughness).toBe(0.85);
    // …and an explicit override still wins.
    expect(
      roadSurfaceToParams({ wet: 0, snow: 1 }, { ...opts, snowRoughness: 0.7 }).roughness,
    ).toBe(0.7);
  });

  it("clamps snow like it clamps wetness, and interpolates monotonically", () => {
    expect(roadSurfaceToParams({ wet: 0, snow: -1 })).toEqual(
      roadSurfaceToParams({ wet: 0, snow: 0 }),
    );
    expect(roadSurfaceToParams({ wet: 0, snow: 2 })).toEqual(
      roadSurfaceToParams({ wet: 0, snow: 1 }),
    );
    const light = roadSurfaceToParams({ wet: 0, snow: 0.25 });
    const heavy = roadSurfaceToParams({ wet: 0, snow: 0.75 });
    expect(light.darken).toBeGreaterThan(1);
    expect(heavy.darken).toBeGreaterThan(light.darken);
  });

  it("SNOW_ROAD_BRIGHTEN stays inside the bounds its reasoning gives it", () => {
    // Below 1 keeps the measured wrong way round — that half is hard, and it
    // is what the audit's L 82.6 / 84.8 pair convicts.
    //
    // THE UPPER HALF IS A MARGIN, NOT A CROSSING POINT, and this comment used
    // to state it as one („at or above 2 the road overtakes its own lane
    // markings"). Worked through 2026-08-19: StaticWorld tints the road
    // `darken × ROAD_ALBEDO_TINT (0.72) × asphaltMapTexel` and paints the
    // markings at #e9e7df × 1.0 ≈ 0.91, so the crossing sits at
    // `asphaltMapTexel ≈ 0.91 / (2 × 0.72) ≈ 0.63` — a value that depends
    // entirely on the asphalt PHOTO, which is loaded at runtime and which no
    // node test can read a texel of. So 2 is a reasoned ceiling with the
    // markings on the far side of it, not a computed threshold, and saying
    // otherwise was a number asserted rather than measured.
    //
    // Why the ceiling matters at all: the rule engine grades lane keeping and
    // stop lines off exactly those markings, so a picture that buries them
    // fails students on a skill it just took away — the same crime as the
    // green tick for an unmeasured skill, pointing the other way. The number
    // between the two bounds is REASONED and the R0 look is still owed (see
    // the constant's own recipe in weather.ts).
    expect(SNOW_ROAD_BRIGHTEN).toBeGreaterThan(1);
    expect(SNOW_ROAD_BRIGHTEN).toBeLessThan(2);
  });

  it("the store's own primed snow value moves the SHIPPED road call site", () => {
    // The seam this fix is routed across, driven with the store's real values
    // rather than with literals: a snow lesson primed exactly the way
    // SimEnvironment primes it, through StaticWorld's OWN road opts bag
    // (:279), must not land on the dry road.
    //
    // WHAT THIS TEST USED TO ALSO ASSERT, AND WHY IT IS GONE:
    //   expect(wetnessToRoadParams(getWetness())).toEqual(
    //     roadSurfaceToParams({ wet: 0, snow: 0 }));
    // getWetness() is 0 in a snow scene, so that compared f(0) with f(0) —
    // un-failable, the exact crime the block docblock above convicts the
    // DELETED assertion of, committed again three lines under the conviction.
    // Worse than useless: by naming the left-hand side „as rendered today" and
    // asserting it EQUALS the dry road, it wrote the defect down as the
    // expected result. The failable claim about routing cannot be made from
    // inside this module at all — it is made at the foot of this file, against
    // the barrel and the reader.
    const roadOpts = { dryRoughness: 1.0, wetRoughness: 0.5, wetDarken: 0.6 };
    resetWeather();
    primeWeather(false, false, true);
    expect(getSnowIntensity()).toBe(1);
    expect(getWetness()).toBe(0);
    const fromStore = roadSurfaceToParams(
      { wet: getWetness(), snow: getSnowIntensity() },
      roadOpts,
    );
    // Mutation that reddens this: SNOW_ROAD_BRIGHTEN → 1 (then darken ties the
    // dry road) — the whole-fix deletion. Verified by running it.
    expect(fromStore).not.toEqual(wetnessToRoadParams(getWetness(), roadOpts));
    expect(fromStore.darken).toBeGreaterThan(1);
  });
});

// ---------------------------------------------------------------------------
// THE RESTORED GUARD — a snow term in this module must arrive WITH its reader
//
// This is the specification the deleted „carries no snow/ice term" assertion
// stated in its docblock and never implemented. Restated so it can go red:
//
//   IF `weather.ts` exposes a snow-bearing road mapping, THEN that mapping
//   must be REACHABLE (doc 05: StaticWorld may only import from the module
//   barrel, so a helper missing from `index.ts` does not exist) and it must be
//   READ — fed a live snow value by the road material.
//
// Anything short of both is the half-routed state, and the half-routed state
// is the dangerous one because it reads like a fix: `roadSurfaceToParams` has
// tests, a constant with a reasoning block and a name in the header, and it
// changes NOT ONE PIXEL of the snow lesson the audit filed as critical. The
// finding stays open while looking closed — the same shape as a green tick for
// a skill nobody measured.
//
// WHY THIS PROBE READS SOURCE. There is no behavioural seam available: this
// suite runs `environment: "node"` with no DOM, StaticWorld is an R3F
// component, and the barrel pulls SimEnvironment → @react-three/fiber, so
// neither can be imported here. Reading the two files as TEXT is the only
// instrument left, and this project's rule about instruments applies to it —
// the SELF-CHECK below runs the probe against hand-written samples of every
// shape (routed, not routed, routed-only-in-a-comment, and wired through to a
// dead `snow: 0`) and fails if the probe misses any of them.
//
// The probe errs toward RED by construction: a correct routing written in some
// shape it does not recognise — a hoisted surface variable instead of the
// inline object literal StaticWorld's three call sites all use — reports NOT
// routed. If that happens, RE-POINT this probe at the new shape. Do not delete
// it. Deleting it is how this guard was lost the first time.
//
// This module reaching into `world/` is a test reading a file, not an import:
// no module boundary is crossed at runtime, and the boundary is what is being
// asserted.
// ---------------------------------------------------------------------------

/**
 * Source with comments removed. Both files DISCUSS this routing in prose —
 * `weather.ts`'s header spells the two-file change out line by line, and the
 * barrel carries its own note about the boundary rule — so a probe that did
 * not strip comments would report the work done the moment somebody wrote it
 * down. That is the reassuring-direction lie; COMMENTED_ONLY below catches it.
 */
function stripComments(src: string): string {
  return src.replace(/\/\*[\s\S]*?\*\//g, " ").replace(/(^|[^:])\/\/[^\n]*/g, "$1");
}

/**
 * Read a source file with line endings normalised. Both routed files are CRLF
 * on this checkout (measured 2026-08-19: index.ts 151 CRLF / 0 bare LF,
 * StaticWorld.tsx 669 / 0). The probe's own regexes are newline-agnostic, but
 * the clearability patch below anchors on whole lines, and an anchor written
 * with `\n` silently missed on the first run — a probe that reports „not
 * routed" because of a carriage return is a probe that convicts the wrong
 * thing. Normalising here beats encoding one checkout's line endings.
 */
function readSource(path: string): string {
  return readFileSync(path, "utf8").replace(/\r\n/g, "\n");
}

interface RoutingReport {
  /** Reachable: named in the module barrel, so StaticWorld can import it. */
  reachable: boolean;
  /** The reader takes the store's snow channel at all. */
  readsSnowChannel: boolean;
  /** …and passes it LIVE into the snow-bearing mapping (`snow: 0` is not). */
  passesLiveSnow: boolean;
}

function routingOf(barrelSrc: string, readerSrc: string): RoutingReport {
  const barrel = stripComments(barrelSrc);
  const reader = stripComments(readerSrc);
  // The first object literal of every `roadSurfaceToParams({ … }, …)` call.
  const surfaces = [...reader.matchAll(/roadSurfaceToParams\s*\(\s*\{([^}]*)\}/g)];
  const passesLiveSnow = surfaces.some(([, arg]) => {
    const bound = /\bsnow\b\s*(?::\s*([^,}]+))?/.exec(arg);
    if (!bound) return false;
    // `{ wet, snow }` shorthand binds the identifier — that is live.
    const value = (bound[1] ?? "snow").trim();
    return !/^(?:0(?:\.0*)?|false)$/.test(value);
  });
  return {
    reachable: /\broadSurfaceToParams\b/.test(barrel),
    readsSnowChannel: /\b(?:useSnowIntensity|getSnowIntensity)\b/.test(reader),
    passesLiveSnow,
  };
}

const fmtRouting = (r: RoutingReport): string =>
  `reachable=${r.reachable} readsSnowChannel=${r.readsSnowChannel} passesLiveSnow=${r.passesLiveSnow}`;

describe("the snow term and its reader ship together", () => {
  // Hand-written, each verified by eye against the real file it imitates.
  const BARREL_WITHOUT = [
    `export { useWetness, useSnowIntensity, wetnessToRoadParams } from "./weather";`,
    `export type { RoadWetnessParams } from "./weather";`,
  ].join("\n");
  const BARREL_COMMENTED_ONLY = [
    `// add roadSurfaceToParams to this barrel beside wetnessToRoadParams — doc 05`,
    `export { useWetness, useSnowIntensity, wetnessToRoadParams } from "./weather";`,
  ].join("\n");
  const BARREL_WITH = [
    `export { useWetness, useSnowIntensity, roadSurfaceToParams, wetnessToRoadParams } from "./weather";`,
    `export type { RoadSurfaceState, RoadWetnessParams } from "./weather";`,
  ].join("\n");

  const READER_TODAY = [
    `import { useWetness, wetnessToRoadParams } from "@/modules/sim/environment";`,
    `const wetness = useWetness();`,
    `const wet = useMemo(() => wetnessToRoadParams(wetness, { dryRoughness: 1.0 }), [wetness]);`,
  ].join("\n");
  const READER_DEAD_SNOW = [
    `import { useSnowIntensity, useWetness, roadSurfaceToParams } from "@/modules/sim/environment";`,
    `const wetness = useWetness();`,
    `const snow = useSnowIntensity();`,
    `const wet = useMemo(() => roadSurfaceToParams({ wet: wetness, snow: 0 }, { dryRoughness: 1.0 }), [wetness, snow]);`,
  ].join("\n");
  const READER_ROUTED = [
    `import { useSnowIntensity, useWetness, roadSurfaceToParams } from "@/modules/sim/environment";`,
    `const wetness = useWetness();`,
    `const snow = useSnowIntensity();`,
    `const wet = useMemo(() => roadSurfaceToParams({ wet: wetness, snow }, { dryRoughness: 1.0 }), [wetness, snow]);`,
  ].join("\n");

  it("SELF-CHECK: the probe convicts every shape of the half-routed state", () => {
    // A probe is worth nothing until it has been shown to go red. Every line
    // here is a case this lane's rules name, and every one of them would be a
    // silent pass for a lazier predicate.
    const cases: ReadonlyArray<readonly [string, string, string, string]> = [
      [
        "SHIPPED TODAY — term exists, barrel hides it, reader never asks",
        BARREL_WITHOUT,
        READER_TODAY,
        "reachable=false readsSnowChannel=false passesLiveSnow=false",
      ],
      [
        "ROUTING WRITTEN DOWN IN A COMMENT IS NOT ROUTING",
        BARREL_COMMENTED_ONLY,
        READER_TODAY,
        "reachable=false readsSnowChannel=false passesLiveSnow=false",
      ],
      [
        "BARREL ONLY — exported, and still nobody reads it",
        BARREL_WITH,
        READER_TODAY,
        "reachable=true readsSnowChannel=false passesLiveSnow=false",
      ],
      [
        "DEAD ROUTING — every wire in place and `snow: 0` at the end of it",
        BARREL_WITH,
        READER_DEAD_SNOW,
        "reachable=true readsSnowChannel=true passesLiveSnow=false",
      ],
      [
        "ROUTED — the corrected behaviour this guard must NOT fail",
        BARREL_WITH,
        READER_ROUTED,
        "reachable=true readsSnowChannel=true passesLiveSnow=true",
      ],
    ];
    for (const [label, barrel, reader, expected] of cases) {
      expect(`${label} → ${fmtRouting(routingOf(barrel, reader))}`).toBe(`${label} → ${expected}`);
    }
  });

  it("THE GUARD: the snow-bearing mapping is reachable AND actually read", () => {
    const barrelPath = fileURLToPath(new URL("../index.ts", import.meta.url));
    const readerPath = fileURLToPath(
      new URL("../../world/components/StaticWorld.tsx", import.meta.url),
    );
    // A rename must RE-POINT this guard, not silently disarm it.
    expect(`barrel exists: ${existsSync(barrelPath)}`).toBe("barrel exists: true");
    expect(`reader exists: ${existsSync(readerPath)}`).toBe("reader exists: true");

    // The premise. The guard only makes a demand if this module actually
    // exposes a snow-bearing mapping: delete `roadSurfaceToParams` from
    // weather.ts and the demand goes with it. That is the other honest way to
    // leave this file, and it is what „a snow term added here must arrive
    // together with its reader" means read in the other direction.
    const snowTermExists = typeof weatherModule.roadSurfaceToParams === "function";
    if (!snowTermExists) return;

    const report = routingOf(readSource(barrelPath), readSource(readerPath));
    // HISTORY, so the green below is read for what it is. When this guard was
    // written (2026-08-19) it was RED: `index.ts` exported `wetnessToRoadParams`
    // and the type `RoadWetnessParams` and NOT `roadSurfaceToParams`, and
    // `StaticWorld.tsx` imported `{ useWetness, wetnessToRoadParams }` and
    // called the rain-only mapping at :279, :294 and :313. Both files were
    // routed in commit ed2dd6f and re-verified 2026-08-22, so this assertion
    // has been GREEN since then and the test below proves that green is
    // load-bearing by cutting each leg back out.
    expect(fmtRouting(report)).toBe("reachable=true readsSnowChannel=true passesLiveSnow=true");
  });

  it("THE GUARD CONVICTS: removing any leg of the routing turns it red", () => {
    // THE ROUTING HAS LANDED, so the question this test asks has changed.
    //
    // It used to simulate applying the prescribed patch, because the guard was
    // RED and a check that convicts everything convicts nothing: a restored
    // assertion that ALSO fails on the corrected behaviour is a permanent red,
    // and a permanent red gets deleted — which is how this guard was lost the
    // first time. That simulation has now served its purpose and cannot be
    // kept: it anchored on the exact import line the real change rewrote, so
    // it began reporting its own patch as inapplicable. (It said so plainly
    // rather than silently passing — "name the drift instead" — which is the
    // only reason this was a two-minute edit and not an afternoon.)
    //
    // The stronger claim, available only now that the real files carry the
    // routing, is the mutation in the other direction: take each leg OUT of
    // the REAL sources in memory and watch that axis go false. A simulation
    // proves the predicate is satisfiable; this proves the predicate is
    // load-bearing on the files that actually ship.
    const barrelPath = fileURLToPath(new URL("../index.ts", import.meta.url));
    const readerPath = fileURLToPath(
      new URL("../../world/components/StaticWorld.tsx", import.meta.url),
    );
    const barrelSrc = readSource(barrelPath);
    const readerSrc = readSource(readerPath);

    // Baseline: the shipping tree satisfies every axis. If this fails, the
    // routing has been undone and the primary assertion above is the report.
    expect(fmtRouting(routingOf(barrelSrc, readerSrc))).toBe(
      "reachable=true readsSnowChannel=true passesLiveSnow=true",
    );

    const cut = (src: string, from: RegExp | string, to: string, label: string): string => {
      const out = src.replace(from, to);
      // A mutation that does not apply would leave the source untouched and the
      // axis green, and this test would pass having proved nothing at all.
      expect(`${label} applied: ${out !== src}`).toBe(`${label} applied: true`);
      return out;
    };

    // 1 · Drop it from the barrel — doc 05 says a helper that is not exported
    //     does not exist, however live the call site looks.
    expect(
      fmtRouting(
        routingOf(cut(barrelSrc, /\broadSurfaceToParams\b/g, "wetnessToRoadParams", "barrel"), readerSrc),
      ),
    ).toBe("reachable=false readsSnowChannel=true passesLiveSnow=true");

    // 2 · Stop reading the snow channel — the mapping is reachable and called,
    //     and there is simply no snow to hand it.
    expect(
      fmtRouting(
        routingOf(
          barrelSrc,
          cut(readerSrc, /\buseSnowIntensity\b/g, "useWetness", "reader-channel"),
        ),
      ),
    ).toBe("reachable=true readsSnowChannel=false passesLiveSnow=true");

    // 3 · Pass a dead zero — the shape of the half-routed state that shipped,
    //     and the one that reads most like a fix.
    expect(
      fmtRouting(
        routingOf(barrelSrc, cut(readerSrc, /\{ wet: wetness, snow \}/g, "{ wet: wetness, snow: 0 }", "reader-value")),
      ),
    ).toBe("reachable=true readsSnowChannel=true passesLiveSnow=false");
  });
});
