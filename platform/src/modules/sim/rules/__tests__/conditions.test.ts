import { describe, expect, it } from "vitest";
import { codes, cruise, drive, tick } from "./fixtures";

// limit 50 · rain factor 0.85 → conditionLimit 42.5 · sustain 3 s.
describe("speed-for-conditions detector", () => {
  it("fires when within the limit but too fast for the rain", () => {
    const ticks = [0, 1, 2, 3, 4].map((t) =>
      tick(t, { speedKmh: 48, maxSpeedKmh: 50, rain: true, headlights: "low" }),
    );
    expect(codes(drive(ticks).events)).toContain("SPEED_TOO_FAST_FOR_CONDITIONS");
  });

  it("does not fire at the same speed in the dry", () => {
    const ticks = [0, 1, 2, 3, 4].map((t) => tick(t, { speedKmh: 48, maxSpeedKmh: 50 }));
    expect(codes(drive(ticks).events)).not.toContain("SPEED_TOO_FAST_FOR_CONDITIONS");
  });

  it("does not fire when suitably slow for the rain", () => {
    const ticks = [0, 1, 2, 3, 4].map((t) =>
      tick(t, { speedKmh: 40, maxSpeedKmh: 50, rain: true, headlights: "low" }),
    );
    expect(codes(drive(ticks).events)).not.toContain("SPEED_TOO_FAST_FOR_CONDITIONS");
  });
});

// limit 50 · fog factor 0.6 → conditionLimit 30 · sustain 3 s (doc 72 AC-03).
describe("speed-for-conditions detector — FOG", () => {
  it("fires at a rain-legal speed when the fog is on (fog is harsher than rain)", () => {
    const ticks = [0, 1, 2, 3, 4].map((t) =>
      tick(t, { speedKmh: 38, maxSpeedKmh: 50, fog: true, fogLightsOn: true, headlights: "low" }),
    );
    expect(codes(drive(ticks).events)).toContain("SPEED_TOO_FAST_FOR_CONDITIONS");
  });

  it("does not fire at the fog-adapted speed (the FP case: 25 in a 50 zone is the taught drive)", () => {
    const ticks = [0, 1, 2, 3, 4].map((t) =>
      tick(t, { speedKmh: 25, maxSpeedKmh: 50, fog: true, fogLightsOn: true, headlights: "low" }),
    );
    expect(codes(drive(ticks).events)).not.toContain("SPEED_TOO_FAST_FOR_CONDITIONS");
  });

  it("does not fire at the same speed without fog (the factor only arms when fog is on)", () => {
    const ticks = [0, 1, 2, 3, 4].map((t) => tick(t, { speedKmh: 38, maxSpeedKmh: 50 }));
    expect(codes(drive(ticks).events)).not.toContain("SPEED_TOO_FAST_FOR_CONDITIONS");
  });

  it("composes with rain by MIN, not product: a foggy rain grades at the fog envelope once", () => {
    // 28 km/h: under fog's 30 AND under rain's 42.5 — a product (0.6 × 0.85 =
    // 0.51 → 25.5) would flag this textbook-prudent foggy-rain drive (A12).
    const ticks = [0, 1, 2, 3, 4].map((t) =>
      tick(t, {
        speedKmh: 28,
        maxSpeedKmh: 50,
        fog: true,
        rain: true,
        fogLightsOn: true,
        headlights: "low",
      }),
    );
    expect(codes(drive(ticks).events)).not.toContain("SPEED_TOO_FAST_FOR_CONDITIONS");
  });
});

// limit 50 · snow factor 0.5 → conditionLimit 25 · sustain 3 s (doc 72 AC-08).
describe("speed-for-conditions detector — SNOW", () => {
  it("fires at a fog-legal speed when the snow is on (snow is the harshest factor)", () => {
    // 28 km/h: under fog's 30 envelope, over snow's 25 — the dry-habit band
    // the winter archetype demos.
    const ticks = [0, 1, 2, 3, 4].map((t) =>
      tick(t, { speedKmh: 28, maxSpeedKmh: 50, snow: true, headlights: "low" }),
    );
    expect(codes(drive(ticks).events)).toContain("SPEED_TOO_FAST_FOR_CONDITIONS");
  });

  it("does not fire at the snow-adapted speed (the FP case: 22 in a 50 zone is the taught winter drive)", () => {
    const ticks = [0, 1, 2, 3, 4].map((t) =>
      tick(t, { speedKmh: 22, maxSpeedKmh: 50, snow: true, headlights: "low" }),
    );
    expect(codes(drive(ticks).events)).not.toContain("SPEED_TOO_FAST_FOR_CONDITIONS");
  });

  it("does not fire at the same speed without snow (the factor only arms when snow is on)", () => {
    const ticks = [0, 1, 2, 3, 4].map((t) => tick(t, { speedKmh: 28, maxSpeedKmh: 50 }));
    expect(codes(drive(ticks).events)).not.toContain("SPEED_TOO_FAST_FOR_CONDITIONS");
  });

  it("composes with rain/fog by MIN, not product: a snowy foggy rain grades at the snow envelope once", () => {
    // 23 km/h: under snow's 25 AND under fog's 30 AND rain's 42.5 — a product
    // (0.5 × 0.6 × 0.85 = 0.255 → 12.75) would flag this textbook-prudent
    // winter drive (A12).
    const ticks = [0, 1, 2, 3, 4].map((t) =>
      tick(t, {
        speedKmh: 23,
        maxSpeedKmh: 50,
        snow: true,
        fog: true,
        rain: true,
        fogLightsOn: true,
        headlights: "low",
      }),
    );
    expect(codes(drive(ticks).events)).not.toContain("SPEED_TOO_FAST_FOR_CONDITIONS");
  });

  // O28 — THIS ASSERTION USED TO READ „snow does NOT arm the fog-lamp or
  // rain-lights duties (no lamp duty on snow)" AND IT CERTIFIED A HOLE. Half of
  // it was right and stays: снеговалеж does not demand FOG lamps, because
  // чл. 74, ал. 1 is a permission with a ceiling („може да се използват само
  // при значително намалена видимост…"), not a duty. The other half asserted
  // that snow demands no LOW BEAMS either, which чл. 70, ал. 1 contradicts in
  // as many words — its condition is намалена видимост and it names no
  // weather. So the low-beam half is now the opposite assertion, and it is
  // what `snowLights` grades.
  it("snow does NOT arm the FOG-LAMP duty (чл. 74 permits fog lamps, never requires them)", () => {
    const ticks = [0, 1, 2, 3, 4].map((t) =>
      tick(t, { speedKmh: 22, maxSpeedKmh: 50, snow: true, headlights: "low", fogLightsOn: false }),
    );
    expect(codes(drive(ticks).events)).not.toContain("FOG_LIGHTS_OFF_IN_FOG");
  });
});

// snowfall + no low beam · sustain = rainLightsSustainSec 3 s (O28, чл. 70 ал. 1).
//
// THE TWO DIRECTIONS THE LANE OWES, on the one lesson that compiles snow
// (`sc-ac-snow`, whose instruction 1 is «Включи късите светлини и потегли
// меко»): an unlit winter drive must CONVICT, and a lit one must be credited
// and convicted of nothing the new arm touches.
describe("lights-in-snow detector (O28)", () => {
  it("CONVICTS an unlit daytime snowfall drive", () => {
    const ticks = [0, 1, 2, 3, 4].map((t) =>
      tick(t, { speedKmh: 22, maxSpeedKmh: 50, snow: true, headlights: "off" }),
    );
    expect(codes(drive(ticks).events)).toContain("HEADLIGHTS_OFF_IN_RAIN");
  });

  it("CREDITS the lit winter drive — the taught drive takes no violation at all", () => {
    // 22 km/h is under the 25 km/h snow envelope and the lamps are on: the
    // whole event list must be violation-free, not merely lamp-free. A missing
    // credit is the founder's own complaint pointing the other way.
    const ticks = [0, 1, 2, 3, 4, 5, 6].map((t) =>
      tick(t, { speedKmh: 22, maxSpeedKmh: 50, snow: true, headlights: "low" }),
    );
    const violations = drive(ticks).events.filter((e) => e.kind === "violation");
    expect(violations).toEqual([]);
  });

  it("prints SNOW copy on the card, never the catalogue's «в дъжд» title", () => {
    // The reuse of the rain row's CODE is only honest if the card the student
    // reads names the weather he was actually driving in — the founder's Б1/Б2
    // defect, which is why `makeViolation`'s override channel exists.
    const ticks = [0, 1, 2, 3, 4].map((t) =>
      tick(t, { speedKmh: 22, maxSpeedKmh: 50, snow: true, headlights: "off" }),
    );
    const card = drive(ticks).events.find((e) => e.code === "HEADLIGHTS_OFF_IN_RAIN");
    expect(card?.titleBg).toContain("снеговалеж");
    expect(card?.titleBg).not.toContain("дъжд");
    expect(card?.explanationBg).toContain("сняг");
    expect(card?.explanationBg).not.toContain("Валеше, а");
  });

  it("keeps the catalogue's severity, points and чл. 70 citation (one duty, one row)", () => {
    const ticks = [0, 1, 2, 3, 4].map((t) =>
      tick(t, { speedKmh: 22, maxSpeedKmh: 50, snow: true, headlights: "off" }),
    );
    const card = drive(ticks)
      .events.filter((e) => e.kind === "violation")
      .find((e) => e.code === "HEADLIGHTS_OFF_IN_RAIN");
    expect(card?.severityClass).toBe("vtorostepenna");
    expect(card?.points).toBe(1);
    expect(card?.lawRef).toContain("чл. 70");
  });

  it("does not fire at the same lamp state without snow (armed exclusively by tick.snow)", () => {
    const ticks = [0, 1, 2, 3, 4].map((t) => tick(t, { speedKmh: 22, headlights: "off" }));
    expect(codes(drive(ticks).events)).not.toContain("HEADLIGHTS_OFF_IN_RAIN");
  });

  it("does not fire while standing still in the snow (grace to reach the L key)", () => {
    // sc-ac-snow is handed over DARK — `scene/cabin.ts initialHeadlightsFor`
    // pre-arms the lamps for night/rain/fog and not for snow — so the seconds
    // before the student reaches the switch may not be a fault.
    const ticks = [0, 1, 2, 3, 4].map((t) => tick(t, { speedKmh: 0, snow: true, headlights: "off" }));
    expect(codes(drive(ticks).events)).not.toContain("HEADLIGHTS_OFF_IN_RAIN");
  });

  it("does not fire on a lamp fumble corrected inside the 3 s sustain", () => {
    const ticks = [
      tick(0, { speedKmh: 22, snow: true, headlights: "low" }),
      tick(1, { speedKmh: 22, snow: true, headlights: "off" }),
      tick(2, { speedKmh: 22, snow: true, headlights: "low" }),
      tick(3, { speedKmh: 22, snow: true, headlights: "low" }),
      tick(4, { speedKmh: 22, snow: true, headlights: "low" }),
    ];
    expect(codes(drive(ticks).events)).not.toContain("HEADLIGHTS_OFF_IN_RAIN");
  });

  it("bills a NIGHT snowfall once, as the основна night fault — never twice", () => {
    // sc-ac-snow's L5 rung IS a night rung (`l5Night()`), so this is the
    // shipped composition, not a hypothetical: one dark car, one bill.
    const ticks = [0, 1, 2, 3, 4, 5].map((t) =>
      tick(t, { speedKmh: 22, snow: true, isNight: true, headlights: "off" }),
    );
    const got = codes(drive(ticks).events);
    expect(got).toContain("HEADLIGHTS_OFF_AT_NIGHT");
    expect(got).not.toContain("HEADLIGHTS_OFF_IN_RAIN");
  });

  it("bills a RAINY snowfall once, and the rain arm owns the card", () => {
    const ticks = [0, 1, 2, 3, 4, 5].map((t) =>
      tick(t, { speedKmh: 20, snow: true, rain: true, headlights: "off" }),
    );
    const lampCards = drive(ticks).events.filter((e) => e.code === "HEADLIGHTS_OFF_IN_RAIN");
    expect(lampCards).toHaveLength(1);
    expect(lampCards[0]?.titleBg).toContain("дъжд");
  });

  it("suppresses CLEAN_DRIVING while the unlit snow episode is still open", () => {
    // 61 ticks at 22 km/h ≈ 372 m — well past the 250 m commendation distance.
    // Without `s.snowLights` in the ongoing-violation list the drive banks a
    // commendation while its own violation stands open, which is credit read
    // off the debrief for a fault never corrected.
    const ticks = cruise(0, 60, { speedKmh: 22, maxSpeedKmh: 50, snow: true, headlights: "off" });
    const got = codes(drive(ticks).events);
    expect(got).toContain("HEADLIGHTS_OFF_IN_RAIN");
    expect(got).not.toContain("CLEAN_DRIVING");
  });

  it("re-arms only on a genuine correction: an uncorrected omission bills the teach and the grade, and never a third time", () => {
    // REPLACED DELIBERATELY, 2026-08-26 (`STANDING_DUTY_REGRADE_SEC`). This
    // asserted `toBe(1)`, and ONE was exactly the defect: the single bill a
    // standing lamp omission produced was spent by the teach-first free
    // mini-lesson (`scenarios/policy.ts`), so `sc-ac-night-lights / pc-wrong`
    // and `sc-ac-rain-lights / pc-wrong` — both driven with the lamps off from
    // end to end — reached their debriefs on «Опасни 0 · Основни 0 ·
    // Второстепенни 0» under «Какво се получи добре: чисто каране по изпитния
    // лист — нито едно нарушение не влезе в точките».
    //
    // The claim the test was written to protect — „a flicker is not a second
    // offence, and only a genuine correction re-arms" — is UNCHANGED and is
    // what the `toBe(2)` half now pins: 30 s of unbroken omission produces the
    // teach at the sustain and the grade ten driving seconds later, and then
    // stops. The ceiling is the point (`STANDING_DUTY_MAX_BILLS`): without it
    // this drive would print three rows, and a three-minute one eighteen —
    // the runaway shape the same sweep files as critical on sc-junction-scan.
    const ticks = cruise(0, 30, { speedKmh: 22, maxSpeedKmh: 50, snow: true, headlights: "off" });
    const n = codes(drive(ticks).events).filter((c) => c === "HEADLIGHTS_OFF_IN_RAIN").length;
    expect(n).toBe(2);

    // AND THE TWO BILLS ARE NOT ALIKE — the second says so. `regrade` is what
    // lets `lessons/engine.ts` refuse to CHARGE one continuous breach twice
    // (exam mode has no teach pass to absorb the first bill); without the mark
    // the layer above cannot tell a re-grade from a fresh offence, and a
    // candidate books 6 основни points for one unlit run priced at 3.
    const lamps = drive(ticks)
      .events.filter((e) => e.kind === "violation" && e.code === "HEADLIGHTS_OFF_IN_RAIN")
      .map((e) => (e.kind === "violation" ? e.regrade === true : false));
    expect(lamps).toEqual([false, true]);

    // …and the ceiling holds however long the omission runs: 180 s is nine
    // re-grade windows and still exactly two bills.
    const long = cruise(0, 180, { speedKmh: 22, maxSpeedKmh: 50, snow: true, headlights: "off" });
    const nLong = codes(drive(long).events).filter((c) => c === "HEADLIGHTS_OFF_IN_RAIN").length;
    expect(nLong).toBe(2);
  });

  it("a genuine correction ends the episode, so a SECOND omission is billed as its own offence", () => {
    // The other direction of the same ceiling: `bills` is zeroed by the reset
    // that re-arms the episode, so a driver who switches the lamps on and
    // later off again has committed a second offence, not a fifth helping of
    // the first.
    const ticks = [
      ...cruise(0, 20, { speedKmh: 22, maxSpeedKmh: 50, snow: true, headlights: "off" }),
      ...cruise(21, 30, { speedKmh: 22, maxSpeedKmh: 50, snow: true, headlights: "low" }),
      ...cruise(31, 50, { speedKmh: 22, maxSpeedKmh: 50, snow: true, headlights: "off" }),
    ];
    const n = codes(drive(ticks).events).filter((c) => c === "HEADLIGHTS_OFF_IN_RAIN").length;
    expect(n).toBe(4);
  });
});

// fog + no front fog lamps · sustain 3 s (doc 72 AC-03, чл. 74).
describe("fog-lamps-in-fog detector", () => {
  it("fires when driving in fog without the front fog lamps", () => {
    const ticks = [0, 1, 2, 3, 4].map((t) =>
      tick(t, { speedKmh: 25, maxSpeedKmh: 50, fog: true, headlights: "low" }),
    );
    expect(codes(drive(ticks).events)).toContain("FOG_LIGHTS_OFF_IN_FOG");
  });

  it("does not fire with the fog lamps on", () => {
    const ticks = [0, 1, 2, 3, 4].map((t) =>
      tick(t, { speedKmh: 25, fog: true, fogLightsOn: true, headlights: "low" }),
    );
    expect(codes(drive(ticks).events)).not.toContain("FOG_LIGHTS_OFF_IN_FOG");
  });

  it("does not fire on a clear road regardless of the lamp state (rain/night included)", () => {
    const clear = [0, 1, 2, 3, 4].map((t) => tick(t, { speedKmh: 40, fogLightsOn: false }));
    expect(codes(drive(clear).events)).not.toContain("FOG_LIGHTS_OFF_IN_FOG");
    const rainy = [0, 1, 2, 3, 4].map((t) =>
      tick(t, { speedKmh: 40, rain: true, headlights: "low", fogLightsOn: false }),
    );
    expect(codes(drive(rainy).events)).not.toContain("FOG_LIGHTS_OFF_IN_FOG");
    const night = [0, 1, 2, 3, 4].map((t) =>
      tick(t, { speedKmh: 40, isNight: true, headlights: "low", fogLightsOn: false }),
    );
    expect(codes(drive(night).events)).not.toContain("FOG_LIGHTS_OFF_IN_FOG");
  });

  it("does not fire while standing still in fog (grace to reach the V toggle)", () => {
    const ticks = [0, 1, 2, 3, 4].map((t) => tick(t, { speedKmh: 0, fog: true }));
    expect(codes(drive(ticks).events)).not.toContain("FOG_LIGHTS_OFF_IN_FOG");
  });

  it("does not fire on a brief lamp fumble under the 3 s sustain", () => {
    const ticks = [
      tick(0, { speedKmh: 25, fog: true, fogLightsOn: true }),
      tick(1, { speedKmh: 25, fog: true, fogLightsOn: false }),
      tick(2, { speedKmh: 25, fog: true, fogLightsOn: true }),
      tick(3, { speedKmh: 25, fog: true, fogLightsOn: true }),
      tick(4, { speedKmh: 25, fog: true, fogLightsOn: true }),
    ];
    expect(codes(drive(ticks).events)).not.toContain("FOG_LIGHTS_OFF_IN_FOG");
  });
});

describe("lights-in-rain detector", () => {
  it("fires when driving in daytime rain without low beam", () => {
    const ticks = [0, 1, 2, 3, 4].map((t) =>
      tick(t, { speedKmh: 30, maxSpeedKmh: 50, rain: true, headlights: "off" }),
    );
    expect(codes(drive(ticks).events)).toContain("HEADLIGHTS_OFF_IN_RAIN");
  });

  it("does not fire with low beam on", () => {
    const ticks = [0, 1, 2, 3, 4].map((t) => tick(t, { speedKmh: 30, rain: true, headlights: "low" }));
    expect(codes(drive(ticks).events)).not.toContain("HEADLIGHTS_OFF_IN_RAIN");
  });

  it("does not fire when dry", () => {
    const ticks = [0, 1, 2, 3, 4].map((t) => tick(t, { speedKmh: 30, headlights: "off" }));
    expect(codes(drive(ticks).events)).not.toContain("HEADLIGHTS_OFF_IN_RAIN");
  });
});
