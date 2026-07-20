/**
 * scenarioDeepLink — the /simulator?scenario&level seam (THEO-2 drill link).
 *
 * Battery: happy path, the entry-rung fallbacks (missing / garbage /
 * unauthored level), the locked-rung focus signal, and null on unknown
 * templates or non-string params.
 */
import { describe, expect, it } from "vitest";
import { resolveScenarioDeepLink } from "./scenarioDeepLink";

const CATALOG = [
  {
    templateId: "sc-park-perp-rev",
    levels: [
      { level: 1 as const, unlocked: true },
      { level: 2 as const, unlocked: true },
      { level: 3 as const, unlocked: false },
    ],
  },
  {
    // Authored ladder starting above L1 — the entry rung is the LOWEST level.
    templateId: "sc-jx-giveway-b1",
    levels: [
      { level: 2 as const, unlocked: true },
      { level: 4 as const, unlocked: false },
    ],
  },
];

describe("resolveScenarioDeepLink", () => {
  it("resolves an unlocked requested rung to an auto-start target", () => {
    expect(resolveScenarioDeepLink("sc-park-perp-rev", "2", CATALOG)).toEqual({
      templateId: "sc-park-perp-rev",
      level: 2,
      unlocked: true,
    });
  });

  it("keeps a locked rung as a focus-only target (soft gate honored)", () => {
    expect(resolveScenarioDeepLink("sc-park-perp-rev", "3", CATALOG)).toEqual({
      templateId: "sc-park-perp-rev",
      level: 3,
      unlocked: false,
    });
  });

  it("missing level falls back to the entry rung", () => {
    expect(resolveScenarioDeepLink("sc-park-perp-rev", undefined, CATALOG)).toEqual({
      templateId: "sc-park-perp-rev",
      level: 1,
      unlocked: true,
    });
  });

  it("garbage or out-of-range level falls back to the entry rung", () => {
    for (const bad of ["0", "7", "abc", "", "1.5"]) {
      expect(resolveScenarioDeepLink("sc-park-perp-rev", bad, CATALOG)).toEqual({
        templateId: "sc-park-perp-rev",
        level: 1,
        unlocked: true,
      });
    }
  });

  it("unauthored (but in-range) level falls back to the entry rung", () => {
    expect(resolveScenarioDeepLink("sc-jx-giveway-b1", "3", CATALOG)).toEqual({
      templateId: "sc-jx-giveway-b1",
      level: 2,
      unlocked: true,
    });
  });

  it("entry rung is the LOWEST authored level, not the array head", () => {
    const shuffled = [
      {
        templateId: "sc-x",
        levels: [
          { level: 3 as const, unlocked: false },
          { level: 1 as const, unlocked: true },
        ],
      },
    ];
    expect(resolveScenarioDeepLink("sc-x", undefined, shuffled)).toEqual({
      templateId: "sc-x",
      level: 1,
      unlocked: true,
    });
  });

  it("unknown template / empty catalog entry / non-string params → null", () => {
    expect(resolveScenarioDeepLink("sc-nope", "1", CATALOG)).toBeNull();
    expect(resolveScenarioDeepLink(undefined, "1", CATALOG)).toBeNull();
    expect(resolveScenarioDeepLink(["sc-park-perp-rev"], "1", CATALOG)).toBeNull();
    expect(resolveScenarioDeepLink("", "1", CATALOG)).toBeNull();
    expect(
      resolveScenarioDeepLink("sc-empty", "1", [{ templateId: "sc-empty", levels: [] }]),
    ).toBeNull();
  });
});
