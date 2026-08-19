/**
 * O35 — THE LOW-BEAM DUTY HAS ONE SOURCE, AND THIS IS WHERE THAT IS CHECKED.
 *
 * THE DEFECT, found twice from opposite sides because the channel had no owner:
 *   · round 6 (O28) — the GRADER had no snowfall arm at all, so `sc-ac-snow`'s
 *     instruction 1, «Включи късите светлини и потегли меко», was an order
 *     nothing could check;
 *   · round 8 (O35) — the DASHBOARD has no lights row for it either. The scene
 *     publishes one flattened bit, `headlightsRequired = isNight || rain`
 *     (LessonScene.tsx:2871), and `compile.ts` makes the weathers EXCLUSIVE, so
 *     a snow drive can never satisfy it. The car is handed over DARK on that
 *     lesson (`scene/cabin.ts initialHeadlightsFor` pre-arms night/rain/fog and
 *     not snow) and outside the cockpit view the 3D cluster is not in frame.
 *
 * Both are the same fact: what the telltale SHOWS and what the engine GRADES
 * were two derivations that could disagree — and did, for two arms out of three
 * (the snow arm entirely, and the rain arm's citation, which printed the NIGHT
 * card in daytime rain).
 *
 * The structural half of the close is `rules/engine.ts lowBeamDuty`, which both
 * consumers now call. This file is the behavioural half: it drives all sixteen
 * (night, rain, snow, fog) combinations through the REAL reducer and through
 * `armedTelltaleWarnings`, and fails if they ever disagree in either direction —
 * a row shown for a fault the engine does not bill is as bad as a fault billed
 * with no row, and this project has now been bitten by both.
 *
 * MUTATION, RUN 2026-08-19 — AND THE SWEEP ALONE CAUGHT NEITHER, WHICH IS THE
 * POINT OF THE THREE NAMED CASES UNDER IT. Single-sourcing the duty means the
 * two consumers now move TOGETHER, so „they agree" can no longer detect a wrong
 * shared answer; it can only detect drift. Both halves are needed:
 *   · make `lowBeamDuty` forget snow (delete its line) → the sixteen-way sweep
 *     stays GREEN (both sides go silent in step) while „SNOW: convicted AND on
 *     the dashboard" fails, and the independent grader battery
 *     `conditions.test.ts` fails five ways. Measured.
 *   · swap the night/rain order → the sweep stays GREEN again (both sides bill
 *     the rain row) and only „a rainy NIGHT bills the основна night row" fails.
 *     Measured: without that case the swap was invisible to all 37 tests in
 *     this directory, and it under-charges a 3-point основна fault as a 1-point
 *     второстепенна one while printing «в дъжд» over a night frame.
 */
import { describe, expect, it } from "vitest";

import { armedTelltaleWarnings, type TelltaleConditions } from "../../hud/telltaleWarnings";
import { createDashboardStatus } from "../../hud/dashboardStatus";
import { lowBeamDuty } from "../engine";
import { codes, drive, tick } from "./fixtures";

/** Every combination of the four flags the duty can be asked about. */
const COMBINATIONS: TelltaleConditions[] = [];
for (const isNight of [false, true]) {
  for (const rain of [false, true]) {
    for (const snow of [false, true]) {
      for (const fog of [false, true]) COMBINATIONS.push({ isNight, rain, snow, fog });
    }
  }
}

const label = (c: TelltaleConditions) =>
  `night=${c.isNight} rain=${c.rain} snow=${c.snow} fog=${c.fog}`;

/** The low-beam code the GRADER bills for a dark car rolling under these
 *  conditions for long enough to clear every sustain — or null. */
function graderLowBeamCode(c: TelltaleConditions): string | null {
  // 22 km/h keeps every conditions-speed envelope satisfied (snow's 0.5 × 50 =
  // 25 is the harshest), so the only thing under test is the lamp duty.
  const ticks = [0, 1, 2, 3, 4, 5, 6].map((t) =>
    tick(t, {
      speedKmh: 22,
      maxSpeedKmh: 50,
      isNight: c.isNight,
      rain: c.rain,
      snow: c.snow,
      fog: c.fog,
      // Fog lamps ON throughout: the чл. 74 duty is a different lamp and a
      // different row, and this test is about the low beams only.
      fogLightsOn: true,
      headlights: "off",
    }),
  );
  const billed = codes(drive(ticks).events).filter(
    (x) => x === "HEADLIGHTS_OFF_AT_NIGHT" || x === "HEADLIGHTS_OFF_IN_RAIN",
  );
  // One dark car, one bill — asserted here rather than assumed, because the
  // whole reason the three arms exclude each other is to keep this at 1.
  expect(billed.length, `${label(c)} billed ${billed.join("+")}`).toBeLessThanOrEqual(1);
  return billed[0] ?? null;
}

/** The low-beam code the DASHBOARD shows for the same dark rolling car. */
function telltaleLowBeamCode(c: TelltaleConditions): string | null {
  const s = createDashboardStatus();
  s.engineOn = true;
  s.speedKmh = 22;
  s.seatbeltOn = true;
  s.parkingBrakeOn = false;
  s.headlights = "off";
  s.fogLightsOn = true;
  // The legacy single bit, written the way the scene writes it. It is passed so
  // the fallback path cannot accidentally be the thing under test.
  s.headlightsRequired = c.isNight || c.rain;
  const row = armedTelltaleWarnings(s, c).find((w) => w.id === "lights");
  return row?.code ?? null;
}

describe("the low-beam duty comes from one source", () => {
  it("the grader and the telltale agree on ALL sixteen weather/time combinations", () => {
    const disagreements: string[] = [];
    for (const c of COMBINATIONS) {
      const graded = graderLowBeamCode(c);
      const shown = telltaleLowBeamCode(c);
      if (graded !== shown) {
        disagreements.push(
          `${label(c)}: engine bills ${graded ?? "nothing"}, HUD shows ${shown ?? "nothing"}`,
        );
      }
    }
    expect(disagreements).toEqual([]);
  });

  it("SNOW: the dark winter drive is convicted AND the row is on the dashboard", () => {
    // The two halves of O35/O28 stated as one sentence, on the conditions
    // `sc-ac-snow` actually compiles: snowfall, daytime, no rain, no fog.
    const snowDay: TelltaleConditions = { isNight: false, rain: false, snow: true, fog: false };
    expect(graderLowBeamCode(snowDay)).toBe("HEADLIGHTS_OFF_IN_RAIN");
    expect(telltaleLowBeamCode(snowDay)).toBe("HEADLIGHTS_OFF_IN_RAIN");
    expect(lowBeamDuty(snowDay)).toBe("snow");
  });

  it("SNOW, LAMPS ON: no conviction and no row — the credit direction", () => {
    // A false ping is a false accusation with a lamp on it; the founder's own
    // complaint is a false FAILURE, so the quiet direction is asserted too.
    const lit = [0, 1, 2, 3, 4, 5, 6].map((t) =>
      tick(t, { speedKmh: 22, maxSpeedKmh: 50, snow: true, headlights: "low" }),
    );
    expect(drive(lit).events.filter((e) => e.kind === "violation")).toEqual([]);

    const s = createDashboardStatus();
    s.engineOn = true;
    s.speedKmh = 22;
    s.seatbeltOn = true;
    s.parkingBrakeOn = false;
    s.headlights = "low";
    const shown = armedTelltaleWarnings(s, {
      isNight: false,
      rain: false,
      snow: true,
      fog: false,
    });
    expect(shown.map((w) => w.id)).not.toContain("lights");
  });

  it("DRY DAY: neither side invents a duty", () => {
    const dry: TelltaleConditions = { isNight: false, rain: false, snow: false, fog: false };
    expect(graderLowBeamCode(dry)).toBeNull();
    expect(telltaleLowBeamCode(dry)).toBeNull();
  });

  it("a rainy NIGHT bills the основна night row, not the 1-point rain row", () => {
    // The precedence is not cosmetic and it is not symmetric: night is основна
    // (3 т.) and carries the «нощем» card; rain is второстепенна (1 т.) and
    // carries «в дъжд». Reversing the two inside `lowBeamDuty` moves BOTH
    // consumers at once, so the sweep above cannot see it — this case is what
    // sees it, and what stops a night fault being billed at a third of its
    // weight with the wrong weather named on the card.
    const rainyNight: TelltaleConditions = {
      isNight: true,
      rain: true,
      snow: false,
      fog: false,
    };
    expect(graderLowBeamCode(rainyNight)).toBe("HEADLIGHTS_OFF_AT_NIGHT");
    expect(telltaleLowBeamCode(rainyNight)).toBe("HEADLIGHTS_OFF_AT_NIGHT");
    const card = drive(
      [0, 1, 2, 3, 4, 5, 6].map((t) =>
        tick(t, { speedKmh: 22, maxSpeedKmh: 50, isNight: true, rain: true, headlights: "off" }),
      ),
    ).events.find((e) => e.kind === "violation");
    expect(card?.code).toBe("HEADLIGHTS_OFF_AT_NIGHT");
    expect(card?.severityClass).toBe("osnovna");
    expect(card?.points).toBe(3);
  });

  it("a snowy NIGHT is one основна bill and one night row, never two", () => {
    const snowyNight: TelltaleConditions = { isNight: true, rain: false, snow: true, fog: false };
    expect(graderLowBeamCode(snowyNight)).toBe("HEADLIGHTS_OFF_AT_NIGHT");
    expect(telltaleLowBeamCode(snowyNight)).toBe("HEADLIGHTS_OFF_AT_NIGHT");
  });

  it("the legacy single-bit path is the one that cannot see snow — and it is still live", () => {
    // Not a hypothetical: `TelltaleEdgePings.tsx:61` and
    // `LessonPlayShell.tsx:2199` both call `armedTelltaleWarnings(s)` with no
    // conditions today, so this IS what a snow lesson renders. Pinned so the
    // day the scene publishes the flags, THIS is the assertion that has to be
    // deleted — rather than the hole being rediscovered by a third round.
    const s = createDashboardStatus();
    s.engineOn = true;
    s.speedKmh = 22;
    s.seatbeltOn = true;
    s.parkingBrakeOn = false;
    s.headlights = "off";
    s.headlightsRequired = false || false; // isNight || rain, on a snow drive
    expect(armedTelltaleWarnings(s).map((w) => w.id)).not.toContain("lights");
    // …while the grader convicts the very same frame. That gap is the finding,
    // and it closes in `LessonScene.tsx` + `dashboardStatus.ts`, not here.
    expect(
      graderLowBeamCode({ isNight: false, rain: false, snow: true, fog: false }),
    ).toBe("HEADLIGHTS_OFF_IN_RAIN");
  });
});
