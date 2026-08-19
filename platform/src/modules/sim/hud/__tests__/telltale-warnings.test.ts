import { describe, expect, it } from "vitest";
import { createRuleEngine, reduceTick, type RuleEngineState } from "../../rules";
import type { SimTick } from "../../rules/types";
import { createDashboardStatus, type DashboardStatus } from "../dashboardStatus";
import {
  armedTelltaleWarnings,
  headlightDutyCode,
  telltaleWarningsKey,
  type TelltaleConditions,
} from "../telltaleWarnings";

/**
 * The edge pings exist because a telltale nobody looks at teaches nothing
 * (founder 2026-07-28). Their whole value depends on being ARMED, not merely
 * "lamp off": a car parked with the engine off must be silent, and a fault the
 * rule engine is about to grade must not be.
 */

function status(over: Partial<DashboardStatus> = {}): DashboardStatus {
  return { ...createDashboardStatus(), ...over };
}

const ids = (s: DashboardStatus) => armedTelltaleWarnings(s).map((w) => w.id);

describe("armedTelltaleWarnings", () => {
  it("says nothing about a cold parked car", () => {
    // Engine off, belt off, parking brake on — the A1 spawn state. Warning
    // here would fire on every single session before the student did anything.
    expect(ids(status())).toEqual([]);
  });

  it("arms the belt as soon as the engine runs, before the car moves", () => {
    // The belt has to be on BEFORE moving off; a ping that waits for motion
    // arrives one graded mistake late.
    expect(ids(status({ engineOn: true }))).toEqual(["belt"]);
  });

  it("arms the belt on a rolling car even with the engine stalled", () => {
    expect(ids(status({ engineOn: false, speedKmh: 20 }))).toContain("belt");
  });

  it("drops the belt warning once buckled", () => {
    expect(ids(status({ engineOn: true, seatbeltOn: true }))).toEqual([]);
  });

  it("arms the parking brake only while actually moving", () => {
    const rolling = status({ engineOn: true, seatbeltOn: true, parkingBrakeOn: true, speedKmh: 12 });
    expect(ids(rolling)).toEqual(["handbrake"]);
    // Stationary with the brake on is the correct state, not a fault.
    const parked = status({ engineOn: true, seatbeltOn: true, parkingBrakeOn: true, speedKmh: 0 });
    expect(ids(parked)).toEqual([]);
  });

  it("arms the headlights only when the conditions require them", () => {
    const base = { engineOn: true, seatbeltOn: true, parkingBrakeOn: false } as const;
    expect(ids(status({ ...base, headlights: "off" }))).toEqual([]);
    expect(ids(status({ ...base, headlights: "off", headlightsRequired: true }))).toEqual(["lights"]);
    expect(ids(status({ ...base, headlights: "low", headlightsRequired: true }))).toEqual([]);
  });

  it("arms the fog lamps only in fog", () => {
    const base = { engineOn: true, seatbeltOn: true, parkingBrakeOn: false } as const;
    expect(ids(status({ ...base, fogLightsOn: false }))).toEqual([]);
    expect(ids(status({ ...base, fogLightsOn: false, fogLightsRequired: true }))).toEqual(["fog"]);
  });

  it("flags forgotten hazards at cruising speed but not at a genuine stop", () => {
    const base = { engineOn: true, seatbeltOn: true, parkingBrakeOn: false, hazardsOn: true } as const;
    // Standing with hazards on is a legitimate „I am an obstacle" signal.
    expect(ids(status({ ...base, speedKmh: 0 }))).toEqual([]);
    expect(ids(status({ ...base, speedKmh: 45 }))).toEqual(["hazards"]);
  });

  it("orders by safety and splits the two rails so neither side stacks alone", () => {
    const all = armedTelltaleWarnings(
      status({
        engineOn: true,
        seatbeltOn: false,
        parkingBrakeOn: true,
        speedKmh: 40,
        headlights: "off",
        headlightsRequired: true,
        fogLightsRequired: true,
        hazardsOn: true,
      }),
    );
    expect(all.map((w) => w.id)).toEqual(["belt", "handbrake", "lights", "fog", "hazards"]);
    expect(all.filter((w) => w.side === "left").map((w) => w.id)).toEqual(["belt", "handbrake"]);
    expect(all.filter((w) => w.side === "right").map((w) => w.id)).toEqual([
      "lights",
      "fog",
      "hazards",
    ]);
  });

  it("names a fixing key for every warning it can raise", () => {
    const all = armedTelltaleWarnings(
      status({
        engineOn: true,
        parkingBrakeOn: true,
        speedKmh: 40,
        headlights: "off",
        headlightsRequired: true,
        fogLightsRequired: true,
        hazardsOn: true,
      }),
    );
    expect(all.every((w) => typeof w.keyHint === "string" && w.keyHint.length > 0)).toBe(true);
  });

  it("keys the render on the armed SET, so speed jitter never re-renders", () => {
    const a = armedTelltaleWarnings(status({ engineOn: true, speedKmh: 41.2 }));
    const b = armedTelltaleWarnings(status({ engineOn: true, speedKmh: 41.9 }));
    expect(telltaleWarningsKey(a)).toBe(telltaleWarningsKey(b));
    const c = armedTelltaleWarnings(status({ engineOn: true, seatbeltOn: true, speedKmh: 41.9 }));
    expect(telltaleWarningsKey(c)).not.toBe(telltaleWarningsKey(b));
  });
});

// ===========================================================================
// THE MIRROR, CHECKED INSTEAD OF CLAIMED (sweep 161, 2026-08-19)
// ===========================================================================
//
// `telltaleWarnings.ts` has always SAID it "deliberately mirrors the rule
// engine's own arming conditions". Nothing checked it, and by the time it was
// checked the lights row had drifted twice — an arm the engine grew (snow) that
// this channel could not see, and a citation it printed for the wrong one of
// three offences. Both are stated in that file's header; these are the failing
// cases that produced those sentences.
//
// The engine is DRIVEN here rather than paraphrased. A paraphrase of
// `reduceTick` would be a third copy of the thing whose second copy is the bug.

/** A neutral, legal frame in the shape `reduceTick` expects — belted, handbrake
 *  off, moving well over `movingSpeedKmh`, on a lit dry road. Only the lamp
 *  channels are varied; every assertion below filters to lamp codes, so no
 *  other detector's opinion can decide these tests. */
function lampTick(t: number, over: Partial<SimTick> = {}): SimTick {
  return {
    t,
    speedKmh: 30,
    maxSpeedKmh: 50,
    position: { x: 0, y: 0 },
    headingDeg: 0,
    laneOffsetM: 0,
    laneId: 0,
    indicator: "off",
    headlights: "low",
    seatbeltOn: true,
    handbrakeOn: false,
    gear: 1,
    isNight: false,
    events: [],
    ...over,
  };
}

const LAMP_CODES = [
  "HEADLIGHTS_OFF_AT_NIGHT",
  "HEADLIGHTS_OFF_IN_RAIN",
  "FOG_LIGHTS_OFF_IN_FOG",
] as const;

/** Twelve seconds at 1 Hz — comfortably past every lamp sustain — folded
 *  through the REAL engine; returns the lamp codes it convicted. */
function gradedLampCodes(over: Partial<SimTick>): string[] {
  let state: RuleEngineState = createRuleEngine();
  const seen = new Set<string>();
  for (let t = 0; t <= 12; t += 1) {
    const r = reduceTick(state, lampTick(t, over));
    state = r.state;
    for (const e of r.events) if ((LAMP_CODES as readonly string[]).includes(e.code)) seen.add(e.code);
  }
  return [...seen];
}

const conditions = (over: Partial<TelltaleConditions> = {}): TelltaleConditions => ({
  isNight: false,
  rain: false,
  snow: false,
  fog: false,
  ...over,
});

/** The cabin as the sweep's weather drills hand it over: engine running, belted,
 *  rolling at the same 30 км/ч the ticks above carry, and DARK — `scene/cabin.ts
 *  initialHeadlightsFor` returns "low" for night/rain/fog and NOT for snow, so
 *  the snow drill really does start here. */
const darkRollingCabin = () =>
  status({ engineOn: true, seatbeltOn: true, parkingBrakeOn: false, speedKmh: 30, headlights: "off" });

describe("the lights telltale and the rule engine are one source", () => {
  it("DRIFT 1 — arms on SNOWFALL, the arm round 6 gave the grader and this channel never got", () => {
    // The engine convicts a dark car in daytime snow (O28). Before conditions
    // existed here, `headlightsRequired` was the scene's „isNight || rain" and
    // snow is neither — so the ping stayed silent through a conviction.
    // MUTATION that proves this assertion is real: drop `|| c.snow` from
    // `headlightDutyCode` and this goes red on the first expect.
    expect(gradedLampCodes({ snow: true, headlights: "off" })).toContain("HEADLIGHTS_OFF_IN_RAIN");
    const warned = armedTelltaleWarnings(darkRollingCabin(), conditions({ snow: true }));
    expect(warned.map((w) => w.id)).toContain("lights");

    // …and the legacy single-bit path is the silence itself. This is not an
    // aspiration: it is what ships until LessonScene publishes the conditions,
    // and it is pinned so that the day it is fixed THIS line is what fails.
    const legacy = armedTelltaleWarnings(
      status({ engineOn: true, seatbeltOn: true, parkingBrakeOn: false, speedKmh: 30, headlights: "off" }),
    );
    expect(legacy.map((w) => w.id)).not.toContain("lights");
  });

  it("DRIFT 2 — cites the RAIN row in rain, not the night row it used to print", () => {
    // `LessonPlayShell.tsx` spends `code` on VIOLATIONS[code] for the student's
    // explanation, corrective and lawRef. The night row's severity is osnovna
    // and its words are about darkness; printing it over a daytime rain drill
    // is THEO-4's forbidden case — a wrong explanation wearing a citation.
    // MUTATION: return "HEADLIGHTS_OFF_AT_NIGHT" unconditionally from
    // `headlightDutyCode` and this expect goes red while the night test below
    // stays green, which is exactly the pair that pins the branch.
    expect(gradedLampCodes({ rain: true, headlights: "off" })).toContain("HEADLIGHTS_OFF_IN_RAIN");
    const [lights] = armedTelltaleWarnings(darkRollingCabin(), conditions({ rain: true })).filter(
      (w) => w.id === "lights",
    );
    expect(lights?.code).toBe("HEADLIGHTS_OFF_IN_RAIN");
  });

  it("does NOT downgrade a night offence — the false-refusal direction", () => {
    // The opposite error is just as bad: quietly re-labelling the основна night
    // fault as the второстепенна rain one would tell a student that driving
    // dark at night costs 1 point instead of 3. The engine's night arm carries
    // no `!raining` guard, so a rainy night is a NIGHT offence; this must
    // follow it. MUTATION: reorder `headlightDutyCode` to test rain first and
    // both of the next two expects go red.
    expect(gradedLampCodes({ isNight: true, headlights: "off" })).toContain(
      "HEADLIGHTS_OFF_AT_NIGHT",
    );
    const night = armedTelltaleWarnings(darkRollingCabin(), conditions({ isNight: true })).find(
      (w) => w.id === "lights",
    );
    expect(night?.code).toBe("HEADLIGHTS_OFF_AT_NIGHT");
    const rainyNight = armedTelltaleWarnings(
      darkRollingCabin(),
      conditions({ isNight: true, rain: true }),
    ).find((w) => w.id === "lights");
    expect(rainyNight?.code).toBe("HEADLIGHTS_OFF_AT_NIGHT");
  });

  it("never pings a lamp duty the engine does not grade — every condition, both directions", () => {
    // THE INVARIANT the two drifts got past, stated over the whole 2^3 of
    // night × rain × snow rather than the three cases someone thought of:
    //   engine convicts ⇒ the ping was armed AND named the same code
    //   engine silent   ⇒ the ping is silent
    // The second half is what stops "fix the miss by warning about everything".
    for (const isNight of [false, true]) {
      for (const rain of [false, true]) {
        for (const snow of [false, true]) {
          const c = conditions({ isNight, rain, snow });
          const where = `night=${isNight} rain=${rain} snow=${snow}`;

          const graded = gradedLampCodes({ isNight, rain, snow, headlights: "off" }).filter((code) =>
            code.startsWith("HEADLIGHTS_"),
          );
          const armed = armedTelltaleWarnings(darkRollingCabin(), c).filter((w) => w.id === "lights");
          expect(armed.length, `armed count · ${where}`).toBe(graded.length);
          if (graded.length === 1) expect(armed[0]?.code, `code · ${where}`).toBe(graded[0]);

          // …and with the lamps ON nothing may be convicted or pinged anywhere
          // in the cube — the innocence half, which a looser check would lose.
          expect(
            gradedLampCodes({ isNight, rain, snow, headlights: "low" }).filter((code) =>
              code.startsWith("HEADLIGHTS_"),
            ),
            `graded with lights on · ${where}`,
          ).toEqual([]);
          expect(
            armedTelltaleWarnings(
              status({
                engineOn: true,
                seatbeltOn: true,
                parkingBrakeOn: false,
                speedKmh: 30,
                headlights: "low",
              }),
              c,
            ).map((w) => w.id),
            `armed with lights on · ${where}`,
          ).not.toContain("lights");
        }
      }
    }
  });

  it("keeps the fog row on its own channel — fog is a SEPARATE lamp, not a lights arm", () => {
    // чл. 74's fog lamp and чл. 70's low beam are two switches and two codes.
    // `headlightDutyCode` must not learn about fog: the engine's fog arm reads
    // `tick.fog && !tick.fogLightsOn` and says nothing about the headlights, so
    // a foggy day with the low beams on is a fog-lamp fault ALONE.
    expect(headlightDutyCode(conditions({ fog: true }))).toBeNull();
    const foggy = armedTelltaleWarnings(
      status({
        engineOn: true,
        seatbeltOn: true,
        parkingBrakeOn: false,
        speedKmh: 30,
        headlights: "low",
        fogLightsRequired: true,
        fogLightsOn: false,
      }),
      conditions({ fog: true }),
    );
    expect(foggy.map((w) => w.id)).toEqual(["fog"]);
    expect(gradedLampCodes({ fog: true, fogLightsOn: false })).toContain("FOG_LIGHTS_OFF_IN_FOG");
  });

  it("leaves every other row byte-identical whether or not conditions are passed", () => {
    // The new argument may not become a second way to arm the belt, the
    // handbrake or the hazards — those rows read cabin state only, and a
    // regression there would be paid for by every lesson in the catalogue.
    const s = status({
      engineOn: true,
      seatbeltOn: false,
      parkingBrakeOn: true,
      speedKmh: 40,
      headlights: "low",
      hazardsOn: true,
    });
    const without = armedTelltaleWarnings(s).map((w) => `${w.id}:${w.code}`);
    for (const isNight of [false, true]) {
      for (const rain of [false, true]) {
        expect(
          armedTelltaleWarnings(s, conditions({ isNight, rain })).map((w) => `${w.id}:${w.code}`),
        ).toEqual(without);
      }
    }
  });
});
