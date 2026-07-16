import { describe, expect, it } from "vitest";
import { codes, drive, tick } from "./fixtures";

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

  it("snow does NOT arm the fog-lamp or rain-lights duties (no lamp duty on snow)", () => {
    const ticks = [0, 1, 2, 3, 4].map((t) =>
      tick(t, { speedKmh: 22, maxSpeedKmh: 50, snow: true, headlights: "off", fogLightsOn: false }),
    );
    const got = codes(drive(ticks).events);
    expect(got).not.toContain("FOG_LIGHTS_OFF_IN_FOG");
    expect(got).not.toContain("HEADLIGHTS_OFF_IN_RAIN");
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
