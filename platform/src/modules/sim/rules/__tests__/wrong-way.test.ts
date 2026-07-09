import { describe, expect, it } from "vitest";
import { codes, drive, tick } from "./fixtures";

describe("wrong-way detector", () => {
  it("fires after sustained wrong-way driving", () => {
    const ticks = [0, 1, 2].map((t) => tick(t, { speedKmh: 25, wrongWay: true }));
    expect(codes(drive(ticks).events)).toContain("WRONG_WAY");
  });

  it("does not fire when going the right way", () => {
    const ticks = [0, 1, 2].map((t) => tick(t, { speedKmh: 25 })); // wrongWay absent
    expect(codes(drive(ticks).events)).not.toContain("WRONG_WAY");
  });

  it("does not fire while stopped", () => {
    const ticks = [0, 1, 2, 3].map((t) => tick(t, { speedKmh: 0, wrongWay: true }));
    expect(codes(drive(ticks).events)).not.toContain("WRONG_WAY");
  });
});
