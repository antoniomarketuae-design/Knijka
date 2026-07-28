import { describe, expect, it } from "vitest";
import { boardPolicyFor, formatMegabytesBg } from "./boardPolicy";

describe("boardPolicyFor", () => {
  it("plays the light trace when no reel exists — 113 of 155 templates", () => {
    const p = boardPolicyFor(false, { effectiveType: "4g" });
    expect(p.renderer).toBe("trace");
    expect(p.videoAvailableButHeld).toBe(false);
    expect(p.noticeBg).toBeNull();
  });

  it("upgrades to the reel on a normal connection", () => {
    expect(boardPolicyFor(true, { effectiveType: "4g" }).renderer).toBe("video");
    expect(boardPolicyFor(true, null).renderer).toBe("video");
    expect(boardPolicyFor(true, {}).renderer).toBe("video");
  });

  it("holds the 2,5 MB reel back when Data Saver is on, and says so", () => {
    const p = boardPolicyFor(true, { saveData: true, effectiveType: "4g" });
    expect(p.renderer).toBe("trace");
    expect(p.videoAvailableButHeld).toBe(true);
    expect(p.noticeBg).toContain("Икономия на данни");
  });

  it("holds it back on 2g too", () => {
    for (const t of ["2g", "slow-2g"]) {
      const p = boardPolicyFor(true, { effectiveType: t });
      expect(p.renderer).toBe("trace");
      expect(p.videoAvailableButHeld).toBe(true);
    }
    expect(boardPolicyFor(true, { effectiveType: "3g" }).renderer).toBe("video");
  });

  it("obeys an explicit tap over any connection hint — the student was shown the cost", () => {
    const p = boardPolicyFor(true, { saveData: true, effectiveType: "slow-2g" }, true);
    expect(p.renderer).toBe("video");
    expect(p.videoAvailableButHeld).toBe(false);
    expect(p.noticeBg).toBeNull();
  });

  it("never offers a video that does not exist, even on opt-in", () => {
    expect(boardPolicyFor(false, { saveData: true }, true).renderer).toBe("trace");
    expect(boardPolicyFor(false, { saveData: true }, true).videoAvailableButHeld).toBe(false);
  });

  it("holds the reel back when only ONE half of the pair has one", () => {
    // No shadow-correct trace has ever been rendered, so this is the common
    // case: a photoreal mistake next to a wireframe correct line would read as
    // a difference in media rather than a difference in driving.
    const p = boardPolicyFor(true, { effectiveType: "4g" }, false, false);
    expect(p.renderer).toBe("trace");
    expect(p.videoAvailableButHeld).toBe(true);
    expect(p.noticeBg).toContain("сравняват");
  });

  it("still lets the student choose the reel on an asymmetric pair", () => {
    expect(boardPolicyFor(true, null, true, false).renderer).toBe("video");
  });

  it("prefers the connection reason over the comparison reason", () => {
    const p = boardPolicyFor(true, { saveData: true }, false, false);
    expect(p.noticeBg).toContain("Икономия на данни");
  });
});

describe("formatMegabytesBg", () => {
  it("uses the Bulgarian decimal comma", () => {
    expect(formatMegabytesBg(2550)).toBe("2,5 MB");
    expect(formatMegabytesBg(268)).toBe("0,3 MB");
  });

  it("drops the decimal once the number is large enough not to need it", () => {
    expect(formatMegabytesBg(20480)).toBe("20 MB");
  });
});
