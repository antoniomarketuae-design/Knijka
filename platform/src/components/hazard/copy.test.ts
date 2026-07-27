/**
 * Copy tests.
 *
 * Not "does the string say the right thing" — a human owns that — but the two
 * things that silently break a teaching surface:
 *
 *  1. A MISSING ENTRY. Every verdict and every error code the server can
 *     produce must have Bulgarian words attached, or the student meets a blank
 *     panel at the exact moment the product owes them an explanation. A closed
 *     Record over a closed union catches this at compile time; this test
 *     catches the case where somebody satisfies the type with "".
 *  2. A BARE VERDICT. Doc 64 THEO-4 is founder-ratified and absolute: no
 *     outcome anywhere may be only a label. Every verdict therefore needs a
 *     body that actually explains, which here is asserted as "long enough to
 *     be a sentence" — crude, but it is the failure that keeps happening.
 */

import { describe, expect, it } from "vitest";
import {
  HAZARD_DOOR_RETURN_HREF,
  HAZARD_DOOR_RETURN_LABEL_BG,
  HAZARD_ERROR_COPY_BG,
  HAZARD_VERDICT_COPY,
  clipsPluralBg,
  formatLeadSecBg,
  formatPointsBg,
  formatRunPositionBg,
} from "./copy";
import { HAZARD_DOORS } from "./types";

const VERDICTS = ["excellent", "good", "late", "early", "missed", "void"] as const;
const ERROR_CODES = [
  "NO_ENTITLEMENT",
  "NO_ITEMS",
  "RUN_NOT_FOUND",
  "OUT_OF_ORDER",
  "IMPLAUSIBLE",
  "FAILED",
] as const;

/** Cyrillic — a copy string that slipped back to English would pass a length check. */
const CYRILLIC = /[Ѐ-ӿ]/;

describe("verdict copy", () => {
  it("covers every verdict exactly once", () => {
    expect(Object.keys(HAZARD_VERDICT_COPY).sort()).toEqual([...VERDICTS].sort());
  });

  it("never ships a bare verdict (doc 64 THEO-4)", () => {
    for (const verdict of VERDICTS) {
      const copy = HAZARD_VERDICT_COPY[verdict];
      expect(copy.labelBg.length).toBeGreaterThan(3);
      // A label plus a real explanation, not a label plus a shrug.
      expect(copy.bodyBg.length).toBeGreaterThan(40);
      expect(CYRILLIC.test(copy.labelBg)).toBe(true);
      expect(CYRILLIC.test(copy.bodyBg)).toBe(true);
    }
  });

  it("gives the two opposite mistakes different tones", () => {
    // „твърде рано" is not a near-miss of „отлично"; painting them alike is how
    // an early-tapper learns to tap more.
    expect(HAZARD_VERDICT_COPY.early.tone).not.toBe(HAZARD_VERDICT_COPY.excellent.tone);
    expect(HAZARD_VERDICT_COPY.void.tone).not.toBe(HAZARD_VERDICT_COPY.good.tone);
  });
});

describe("error copy", () => {
  it("covers every action error code", () => {
    expect(Object.keys(HAZARD_ERROR_COPY_BG).sort()).toEqual([...ERROR_CODES].sort());
  });

  it("says something usable in Bulgarian, and never shows a code", () => {
    for (const code of ERROR_CODES) {
      const message = HAZARD_ERROR_COPY_BG[code];
      expect(message.length).toBeGreaterThan(20);
      expect(CYRILLIC.test(message)).toBe(true);
      expect(message).not.toContain(code);
    }
  });
});

describe("doors", () => {
  it("every door knows where the way out points", () => {
    for (const door of HAZARD_DOORS) {
      expect(HAZARD_DOOR_RETURN_HREF[door].startsWith("/")).toBe(true);
      expect(CYRILLIC.test(HAZARD_DOOR_RETURN_LABEL_BG[door])).toBe(true);
    }
  });
});

describe("number formatting", () => {
  it("prints lead time to one decimal, with the direction spelled out", () => {
    expect(formatLeadSecBg(1.44)).toBe("1.4 с преди");
    expect(formatLeadSecBg(1.46)).toBe("1.5 с преди");
    expect(formatLeadSecBg(null)).toBe("—");
  });

  it("does not claim a lead when the reaction came after the hazard", () => {
    expect(formatLeadSecBg(-0.8)).toBe("-0.8 с");
    expect(formatLeadSecBg(0)).toBe("0.0 с");
  });

  it("prints points against their maximum, never as a percentage", () => {
    expect(formatPointsBg(14, 25)).toBe("14 / 25 т.");
    expect(formatPointsBg(0, 0)).toBe("0 / 0 т.");
  });

  it("formats the run position", () => {
    expect(formatRunPositionBg(3, 8)).toBe("3 / 8");
  });

  it("agrees with the noun", () => {
    expect(clipsPluralBg(1)).toBe("клип");
    expect(clipsPluralBg(8)).toBe("клипа");
  });
});
