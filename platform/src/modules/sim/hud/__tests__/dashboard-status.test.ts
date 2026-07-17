/**
 * Status-dashboard pure logic (dashboardStatus.ts): the cold-start defaults,
 * the display-speed rounding, the doc-32 legality tone bands, and the poll
 * hash that gates the bar's low-Hz re-renders (it must flip on every lamp
 * edge and stay stable under sub-km/h speed jitter).
 */

import { describe, expect, it } from "vitest";
import {
  createDashboardStatus,
  dashboardHash,
  displaySpeedKmh,
  HEADLIGHT_LABEL_BG,
  speedTone,
} from "../dashboardStatus";

describe("createDashboardStatus", () => {
  it("matches the A1 cold-start spawn policy (engine off, P, brake on)", () => {
    const s = createDashboardStatus();
    expect(s.engineOn).toBe(false);
    expect(s.gearLabel).toBe("P");
    expect(s.parkingBrakeOn).toBe(true);
    expect(s.seatbeltOn).toBe(false);
    expect(s.leftLampLit).toBe(false);
    expect(s.rightLampLit).toBe(false);
    expect(s.speedKmh).toBe(0);
  });
});

describe("displaySpeedKmh", () => {
  it("rounds to whole km/h", () => {
    expect(displaySpeedKmh(49.6)).toBe(50);
    expect(displaySpeedKmh(49.4)).toBe(49);
  });

  it("shows reverse as magnitude and never renders -0", () => {
    expect(displaySpeedKmh(-7.8)).toBe(8);
    expect(displaySpeedKmh(-0.3)).toBe(0);
    expect(Object.is(displaySpeedKmh(-0.3), -0)).toBe(false);
  });
});

describe("speedTone", () => {
  it("stays ok up to and at the limit", () => {
    expect(speedTone(0, 50)).toBe("ok");
    expect(speedTone(50, 50)).toBe("ok");
    // Rounded display speed drives the tone — 50.4 renders as 50.
    expect(speedTone(50.4, 50)).toBe("ok");
  });

  it("turns over above the limit and danger beyond +10 (doc 32 band)", () => {
    expect(speedTone(51, 50)).toBe("over");
    expect(speedTone(60, 50)).toBe("over");
    expect(speedTone(61, 50)).toBe("danger");
  });
});

describe("dashboardHash", () => {
  it("flips on a blink-lamp edge (the arrows must re-render every half cycle)", () => {
    const a = createDashboardStatus();
    const b = { ...a, leftLampLit: true };
    expect(dashboardHash(a)).not.toBe(dashboardHash(b));
  });

  it("flips on every rendered telltale field", () => {
    const base = createDashboardStatus();
    const variants = [
      { ...base, rightLampLit: true },
      { ...base, indicator: "left" as const },
      { ...base, hazardsOn: true },
      { ...base, engineOn: true },
      { ...base, stalled: true },
      { ...base, gearLabel: "M2" },
      { ...base, parkingBrakeOn: false },
      { ...base, seatbeltOn: true },
      { ...base, headlights: "low" as const },
      { ...base, fogLightsOn: true },
      { ...base, wipersOn: true },
      { ...base, speedKmh: 31 },
    ];
    const seen = new Set([dashboardHash(base)]);
    for (const v of variants) {
      const h = dashboardHash(v);
      expect(seen.has(h)).toBe(false);
      seen.add(h);
    }
  });

  it("stays stable under sub-km/h speed jitter (no wasted re-renders)", () => {
    const a = { ...createDashboardStatus(), speedKmh: 49.6 };
    const b = { ...a, speedKmh: 49.9 };
    expect(dashboardHash(a)).toBe(dashboardHash(b));
  });
});

describe("HEADLIGHT_LABEL_BG", () => {
  it("labels every state, къси/дълги distinct", () => {
    expect(HEADLIGHT_LABEL_BG.low).toBe("Къси");
    expect(HEADLIGHT_LABEL_BG.high).toBe("Дълги");
    expect(HEADLIGHT_LABEL_BG.off).toBe("—");
  });
});
