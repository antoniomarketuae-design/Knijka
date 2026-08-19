/**
 * THE PUBLICATION, DRIVEN — not the derivation it feeds.
 *
 * `snow-lights-row.test.ts` proves that a `DashboardStatus` carrying snow makes
 * `armedTelltaleWarnings` raise the lights row, in both directions. That is the
 * DERIVATION, and it was correct. It reached nobody, and the file said so in
 * its own header: two mutations were run against it and both SURVIVED —
 *
 *   · the scene stops publishing (`dash.conditions = undefined`, O35 exactly)
 *   · a caller forces the legacy single-bit path
 *
 * — because a unit test that builds its own `DashboardStatus` never loads a
 * `.tsx` scene. Re-measured on 2026-08-19 before anything here was written, so
 * this file did not inherit the claim: with `LessonScene.tsx` reverted to
 * `dash.conditions = undefined`, **118 test files / 1,982 tests passed and
 * `tsc --noEmit` exited 0**. A seventeen-year-old on a snow lesson whose own
 * instruction is «включи късите светлини» would have been handed a dark car,
 * shown no lights row, and then billed for it by a grader that CAN see snow —
 * and the whole suite would have said the product was fine.
 *
 * That gap was structural, not an oversight: the vitest environment here is
 * `node` with no DOM, and the write lived inside a `useFrame` in a component
 * that needs an R3F canvas and a wasm physics world to mount. So the write
 * moved out, into `dashboardStatus.ts` — the file that already owns this
 * channel — and this file drives THE SAME FUNCTION THE SCENE CALLS, argument
 * for argument.
 *
 * WHAT THIS FILE PINS, and it is the publication, not the conclusion:
 *   · the four flags reach `DashboardStatus.conditions` verbatim, by reference;
 *   · the status that comes out of the real publication raises the lights row
 *     on snow when read the way the product reads it — `armedTelltaleWarnings(s)`
 *     with NO second argument, which is exactly how `TelltaleEdgePings.tsx` and
 *     `LessonPlayShell.tsx` call it;
 *   · and it does NOT raise it when the student has the lamps on, or when the
 *     weather demands nothing. A row that appears whatever he does is wallpaper,
 *     and a warning nothing measured is the same crime as a green tick nothing
 *     measured, pointing the other way.
 *
 * WHAT IT DOES NOT PIN, measured rather than assumed — see the last describe
 * block. The scene could still delete the whole publish block; no unit test in
 * a `node` environment can see that. What it can no longer do is publish
 * SILENTLY WRONG conditions: dropping the argument is a compile error (pinned
 * below with `@ts-expect-error`, which `tsc --noEmit` checks because tsconfig
 * includes test files), and blanking the field inside the function turns this
 * file red.
 */

import { describe, expect, it } from "vitest";
import {
  createDashboardStatus,
  writeDashboardStatus,
  type DashboardCabinSource,
  type DashboardStatus,
} from "../dashboardStatus";
import { armedTelltaleWarnings, type TelltaleConditions } from "../telltaleWarnings";

const CLEAR_DAY: TelltaleConditions = { isNight: false, rain: false, fog: false, snow: false };
const SNOW_DAY: TelltaleConditions = { isNight: false, rain: false, fog: false, snow: true };
const RAIN_DAY: TelltaleConditions = { isNight: false, rain: true, fog: false, snow: false };
const FOG_DAY: TelltaleConditions = { isNight: false, rain: false, fog: true, snow: false };
const CLEAR_NIGHT: TelltaleConditions = { isNight: true, rain: false, fog: false, snow: false };
const SNOWY_NIGHT: TelltaleConditions = { isNight: true, rain: false, fog: false, snow: true };

/** Flat overrides over the nested cabin shape — the cabin the scene hands over
 *  is one object with a `driveline` on it, but nobody writing a test wants to
 *  remember which half a field lives in. */
type CabinOverrides = Partial<Omit<DashboardCabinSource, "driveline">> &
  Partial<DashboardCabinSource["driveline"]>;

/** A cold car, as `CabinControls` spawns one (A1 spawn policy: engine off, P,
 *  parking brake on, belt off, lamps off). */
function cabinOf(over: CabinOverrides = {}): DashboardCabinSource {
  return {
    blinkOn: over.blinkOn ?? false,
    hazardBlinkOn: over.hazardBlinkOn ?? false,
    indicator: over.indicator ?? "off",
    seatbeltOn: over.seatbeltOn ?? false,
    headlights: over.headlights ?? "off",
    driveline: {
      hazardsOn: over.hazardsOn ?? false,
      engineOn: over.engineOn ?? false,
      stalled: over.stalled ?? false,
      gearLabel: over.gearLabel ?? "P",
      parkingBrakeOn: over.parkingBrakeOn ?? true,
      fogLightsOn: over.fogLightsOn ?? false,
      wipersOn: over.wipersOn ?? false,
    },
  };
}

/**
 * THE SCENE'S OWN CALL, argument for argument and in the same order
 * (`LessonScene.tsx`, the `dashboardStatusRef && dashCabin` block). Written as
 * a positional pass-through rather than an options bag on purpose: if the
 * publication's signature changes and this file is not followed along, this is
 * a compile error here before it is a wrong dashboard on a phone.
 */
function publish(
  conditions: TelltaleConditions,
  over: CabinOverrides = {},
  speedKmh = 0,
  governorCapKmh: number | null = null,
  governorTierBg = "",
): DashboardStatus {
  return writeDashboardStatus(
    createDashboardStatus(),
    cabinOf(over),
    speedKmh,
    conditions,
    governorCapKmh,
    governorTierBg,
  );
}

/** Read the way the PRODUCT reads it: one argument, no conditions supplied by
 *  the test. `TelltaleEdgePings.tsx:61` and `LessonPlayShell.tsx:2200` both call
 *  it exactly like this — read on 2026-08-19, both `armedTelltaleWarnings(s)`
 *  with no second argument — so anything this returns is what a student sees. */
const lightsRow = (s: DashboardStatus) =>
  armedTelltaleWarnings(s).find((w) => w.id === "lights") ?? null;

describe("the scene's publication carries the weather", () => {
  it("all four flags arrive verbatim, for every weather compile can author", () => {
    for (const c of [CLEAR_DAY, SNOW_DAY, RAIN_DAY, FOG_DAY, CLEAR_NIGHT, SNOWY_NIGHT]) {
      expect(publish(c).conditions, JSON.stringify(c)).toEqual(c);
    }
  });

  it("carries them BY REFERENCE — the zero-allocation promise in the header", () => {
    // The old line built `{ isNight, rain, fog, snow }` fresh 60 times a second
    // inside a channel whose header promises zero allocation. The scene now
    // memoises one lesson-static object and this hands it straight through; a
    // defensive `{ ...conditions }` here would quietly put the allocation back.
    const s = publish(SNOW_DAY);
    expect(s.conditions).toBe(SNOW_DAY);
  });

  it("mutates the scene's scratch in place across frames, and returns it", () => {
    // The scene keeps ONE scratch object for the whole drive and points the
    // shell's ref at it (`dashScratchRef`). If this ever started returning a
    // fresh object the shell's ref would go stale after frame one and the bar
    // would freeze — a failure that looks like a physics bug.
    const scratch = createDashboardStatus();
    const first = writeDashboardStatus(scratch, cabinOf(), 0, CLEAR_DAY, null, "");
    const second = writeDashboardStatus(scratch, cabinOf({ engineOn: true }), 31.4, SNOW_DAY, 40, "Начинаещ");
    expect(first).toBe(scratch);
    expect(second).toBe(scratch);
    expect(scratch.engineOn).toBe(true);
    expect(scratch.speedKmh).toBeCloseTo(31.4);
    expect(scratch.conditions).toBe(SNOW_DAY);
    expect(scratch.governorCapKmh).toBe(40);
    expect(scratch.governorTierBg).toBe("Начинаещ");
  });
});

describe("what the student is shown, off the real published status", () => {
  it("THE DEFECT: a snow lesson with the lamps off shows the lights row", () => {
    // O35 in one assertion. This is the test that goes red when the scene stops
    // publishing the conditions — verified by mutation, see the header.
    const row = lightsRow(publish(SNOW_DAY, { engineOn: true, headlights: "off" }));
    expect(row).not.toBeNull();
    expect(row!.labelBg).toContain("Светлините");
    // THEO-4: the row has to be able to say WHICH duty he is failing. A bare
    // „something is wrong" is the bare-verdict defect wearing a warning's coat.
    expect(row!.code).toBeTruthy();
  });

  it("THE OTHER DIRECTION: the same snow drive with the lamps ON shows nothing", () => {
    expect(lightsRow(publish(SNOW_DAY, { engineOn: true, headlights: "low" }))).toBeNull();
  });

  it("THE OTHER DIRECTION: a clear dry day with the lamps off shows nothing", () => {
    expect(lightsRow(publish(CLEAR_DAY, { engineOn: true, headlights: "off" }))).toBeNull();
  });

  it("night and rain still arm it — the snow term displaced nothing", () => {
    for (const c of [CLEAR_NIGHT, RAIN_DAY, SNOWY_NIGHT]) {
      expect(lightsRow(publish(c, { engineOn: true })), JSON.stringify(c)).not.toBeNull();
    }
  });

  it("fog publishes its own duty, and only in fog", () => {
    const fogRow = (s: DashboardStatus) => armedTelltaleWarnings(s).find((w) => w.id === "fog");
    expect(fogRow(publish(FOG_DAY, { engineOn: true, fogLightsOn: false }))).toBeTruthy();
    expect(fogRow(publish(FOG_DAY, { engineOn: true, fogLightsOn: true }))).toBeUndefined();
    expect(fogRow(publish(SNOW_DAY, { engineOn: true, fogLightsOn: false }))).toBeUndefined();
  });

  it("a parked, dead car in a blizzard is left alone", () => {
    // `live = moving || engineOn`. Warning a student about lamps before he has
    // started the car is the noise the founder already complained about, and it
    // would make the assertions above pass for free.
    expect(lightsRow(publish(SNOW_DAY, { engineOn: false }))).toBeNull();
  });
});

describe("the rest of the publication, so the extraction dropped nothing", () => {
  it("every cabin fact the bar draws survives the trip", () => {
    // Every field set AWAY from its cold-car default, so a dropped assignment
    // cannot hide behind a matching default.
    const s = publish(
      FOG_DAY,
      {
        indicator: "right",
        seatbeltOn: true,
        headlights: "high",
        hazardsOn: true,
        engineOn: true,
        stalled: true,
        gearLabel: "M2",
        parkingBrakeOn: false,
        fogLightsOn: true,
        wipersOn: true,
      },
      57.5,
      50,
      "Начинаещ",
    );
    expect(s.indicator).toBe("right");
    expect(s.seatbeltOn).toBe(true);
    expect(s.headlights).toBe("high");
    expect(s.hazardsOn).toBe(true);
    expect(s.engineOn).toBe(true);
    expect(s.stalled).toBe(true);
    expect(s.gearLabel).toBe("M2");
    expect(s.parkingBrakeOn).toBe(false);
    expect(s.fogLightsOn).toBe(true);
    expect(s.wipersOn).toBe(true);
    expect(s.speedKmh).toBeCloseTo(57.5);
    expect(s.governorCapKmh).toBe(50);
    expect(s.governorTierBg).toBe("Начинаещ");
    expect(s.fogLightsRequired).toBe(true);
  });

  it("the arrows follow the cabin's REAL blink clock, not a stalk setting", () => {
    // The whole reason this channel exists at 60 Hz: the DOM arrows flash in
    // phase with the 3D cluster. A lamp that is lit whenever the stalk is set
    // is a lamp that never blinks.
    const litLeft = publish(CLEAR_DAY, { indicator: "left", blinkOn: true });
    expect([litLeft.leftLampLit, litLeft.rightLampLit]).toEqual([true, false]);

    const darkPhase = publish(CLEAR_DAY, { indicator: "left", blinkOn: false });
    expect([darkPhase.leftLampLit, darkPhase.rightLampLit]).toEqual([false, false]);
    // …but the stalk setting itself is still published, for the aria label.
    expect(darkPhase.indicator).toBe("left");

    const hazards = publish(CLEAR_DAY, { indicator: "off", hazardBlinkOn: true });
    expect([hazards.leftLampLit, hazards.rightLampLit]).toEqual([true, true]);
  });

  it("THE LEGACY BIT IS STILL WRONG, and that is pinned rather than hidden", () => {
    // `headlightsRequired` is „isNight || rain" flattened to one bit, so it is
    // FALSE on a snow lesson that requires the lamps — O35's original cause. It
    // is preserved byte-for-byte because `telltaleWarnings.ts` still carries a
    // fallback branch for callers that pass no conditions, and that branch and
    // the tests pinning it belong to another lane. Asserting the wrongness is
    // what stops someone re-wiring a live caller onto the bit and reading a
    // green suite as permission. If this ever starts failing, the legacy path
    // was corrected — replace this test, do not delete it.
    expect(publish(SNOW_DAY).headlightsRequired).toBe(false);
    expect(publish(CLEAR_NIGHT).headlightsRequired).toBe(true);
    expect(publish(RAIN_DAY).headlightsRequired).toBe(true);
    // …and the published CONDITIONS disagree with the bit on exactly that
    // input, which is the entire finding in one line.
    expect(lightsRow(publish(SNOW_DAY, { engineOn: true }))).not.toBeNull();
  });
});

describe("the boundary of what a node-environment test can pin", () => {
  it("REFUSING TO PUBLISH IS A COMPILE ERROR, and a crash if it ever got past", () => {
    // The O35 revert, at the call site. `conditions` is a REQUIRED positional
    // parameter, so a scene that stops handing the weather over does not
    // type-check — and tsconfig `include`s test files, so `tsc --noEmit` checks
    // this very line. Proved by mutation in both directions, run 2026-08-19:
    //   · delete the `@ts-expect-error` → TS2345 here („'undefined' is not
    //     assignable to parameter of type 'TelltaleConditions'");
    //   · make the parameter OPTIONAL back in `dashboardStatus.ts` → TS2578
    //     here instead („Unused '@ts-expect-error' directive").
    // The second is the one that matters: this line cannot stay green unless
    // the parameter is genuinely required. And in the scene itself, dropping
    // the argument fails TS2554 at `LessonScene.tsx` — also measured.
    const blank = () =>
      // @ts-expect-error — conditions may be neither omitted nor blanked.
      writeDashboardStatus(createDashboardStatus(), cabinOf(), 0, undefined, null, "");
    // And the runtime is loud rather than quiet: it reads the flags directly,
    // so a blanked hand-over throws instead of publishing a plausible cold-clear
    // dashboard. That direction matters — O35's whole damage was that the
    // failure LOOKED FINE. A dark car on a snow lesson with no lights row is a
    // silent wrong answer; a thrown frame is not.
    expect(blank).toThrow();
  });

  it("STATES WHAT IS STILL UNPINNED, because a silent gap is the defect itself", () => {
    // A test cannot assert this, so it is written down instead: nothing here
    // can see the scene DELETING its publish block outright. The vitest
    // environment is `node`, the write lives in a `useFrame`, and mounting it
    // needs an R3F canvas plus a wasm physics world. What changed is the shape
    // of the exposure: that deletion takes the WHOLE bar cold — speed pinned at
    // 0, gear stuck on P, engine off, belt warning on forever — which is loud,
    // where `conditions = undefined` alone was silent and cost one winter
    // lesson its lights row. The remaining check is a driven lesson, not a unit
    // test. Route: an R3F-capable component test-bed, or the lesson-audit rig.
    expect(createDashboardStatus().conditions).toBeUndefined();
  });
});
