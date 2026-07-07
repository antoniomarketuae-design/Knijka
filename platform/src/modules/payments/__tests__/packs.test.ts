import { describe, expect, it } from "vitest";
import {
  formatPackPrice,
  isPackId,
  PACK_ACCESS_MONTHS,
  PACK_CURRENCY,
  PACK_IDS,
  PACKS,
} from "../packs";

describe("pack catalog sanity", () => {
  it("sells exactly the two packs the schema documents: core | premium_sim", () => {
    expect([...PACK_IDS].sort()).toEqual(["core", "premium_sim"]);
    expect(PACKS.core.id).toBe("core");
    expect(PACKS.premium_sim.id).toBe("premium_sim");
  });

  it("charges in EUR (Bulgaria's currency since 2026-01-01)", () => {
    expect(PACK_CURRENCY).toBe("eur");
  });

  it("prices are positive integer cents inside the doc-41 corridor", () => {
    // core €9.99–14.99, premium €19.99–24.99 (docs/business/41)
    expect(Number.isInteger(PACKS.core.priceEurCents)).toBe(true);
    expect(Number.isInteger(PACKS.premium_sim.priceEurCents)).toBe(true);
    expect(PACKS.core.priceEurCents).toBeGreaterThanOrEqual(999);
    expect(PACKS.core.priceEurCents).toBeLessThanOrEqual(1499);
    expect(PACKS.premium_sim.priceEurCents).toBeGreaterThanOrEqual(1999);
    expect(PACKS.premium_sim.priceEurCents).toBeLessThanOrEqual(2499);
  });

  it("premium costs more than core", () => {
    expect(PACKS.premium_sim.priceEurCents).toBeGreaterThan(
      PACKS.core.priceEurCents,
    );
  });

  it("every pack grants the 4-month access window", () => {
    expect(PACK_ACCESS_MONTHS).toBe(4);
    for (const id of PACK_IDS) {
      expect(PACKS[id].accessMonths).toBe(PACK_ACCESS_MONTHS);
    }
  });

  it("every pack has Bulgarian display copy and features", () => {
    for (const id of PACK_IDS) {
      const pack = PACKS[id];
      expect(pack.nameBg.length).toBeGreaterThan(0);
      expect(pack.taglineBg.length).toBeGreaterThan(0);
      expect(pack.checkoutDescriptionBg.length).toBeGreaterThan(0);
      expect(pack.featuresBg.length).toBeGreaterThan(0);
    }
  });

  it("isPackId accepts catalog ids and rejects everything else", () => {
    expect(isPackId("core")).toBe(true);
    expect(isPackId("premium_sim")).toBe(true);
    expect(isPackId("premium")).toBe(false);
    expect(isPackId("")).toBe(false);
    expect(isPackId(42)).toBe(false);
    expect(isPackId(null)).toBe(false);
  });

  it("formats prices in Bulgarian euro notation", () => {
    const formatted = formatPackPrice(1299);
    expect(formatted).toContain("12,99");
    expect(formatted).toContain("€");
  });
});
