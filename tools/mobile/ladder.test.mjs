import { describe, expect, it } from "vitest";

import { DEFAULT_DEVICE_IDS, DEVICES, resolveDevices } from "./lib/devices.mjs";

/**
 * THE PROFILE THAT WAS DEFINED, DOCUMENTED, AND NEVER SWEPT.
 *
 * `small-landscape` (780x360) existed in `DEVICES` from the day the ladder was
 * written. Nothing ran it. It was not in the default sweep, so the only numbers
 * anyone ever had for it came from probes that named it by hand — and the last
 * of those recorded 1 case of 18 before the dev server wedged, and was never
 * re-run. Meanwhile the register carried a single figure for row C5 that mixed
 * that stale column in with fresh ones.
 *
 * `devices.mjs` already says, in its own header, that a profile which is
 * defined but not in the default ladder is a profile nobody notices has gone
 * stale. Until this file there was nothing that made that true — the sentence
 * was a comment, and a comment cannot fail a build. The invariant below is the
 * enforcement: EVERY defined profile is in the default ladder. Add a phone to
 * `DEVICES` and you have added it to every sweep, or this test stops the commit
 * that half-added it.
 *
 * It is deliberately cheap — no browser, no dev server, no login — so it runs
 * in the ordinary vitest gate rather than only when somebody remembers to run a
 * sweep, which is the same reasoning `selectors.test.mjs` is built on.
 */
describe("the device ladder", () => {
  it("sweeps every profile it defines — none may be defined-but-unswept", () => {
    expect([...DEFAULT_DEVICE_IDS].sort()).toEqual(Object.keys(DEVICES).sort());
  });

  it("keeps the 360-wide Android class in the ladder, both ways up", () => {
    // Not a rounding error and not a nice-to-have: the product sells at
    // EUR 12.99 to Bulgarian 17-year-olds, and the handsets that segment
    // actually owns are the 360-wide class. A layout that passes on an
    // iPhone 16 and fails at 360px fails for a large part of the paying
    // audience — and 780x360 is the hardest viewport in the set, not the
    // easiest to skip.
    expect(DEFAULT_DEVICE_IDS).toContain("small-portrait");
    expect(DEFAULT_DEVICE_IDS).toContain("small-landscape");
  });

  it("pins the geometry each recorded measurement is quoted against", () => {
    // A profile silently resized would make every historical number for it a
    // lie without changing a single test name.
    const geometry = Object.fromEntries(
      Object.values(DEVICES).map((d) => [d.id, `${d.width}x${d.height}`]),
    );
    expect(geometry).toEqual({
      "iphone16-portrait": "393x852",
      "iphone16-landscape": "852x393",
      "small-portrait": "360x780",
      "small-landscape": "780x360",
    });
  });

  it("pairs every profile with its own rotation", () => {
    // A ladder with a portrait that has no landscape is how „it all have to be
    // on the screen without scrolling" gets answered for one orientation only.
    for (const device of Object.values(DEVICES)) {
      const rotated = Object.values(DEVICES).find(
        (other) =>
          other.id !== device.id &&
          other.width === device.height &&
          other.height === device.width,
      );
      expect(rotated, `${device.id} has no rotated counterpart in the ladder`).toBeDefined();
      expect(rotated.orientation).not.toBe(device.orientation);
    }
  });

  it("resolves the default ladder when a caller names no device", () => {
    expect(resolveDevices([]).map((d) => d.id)).toEqual([...DEFAULT_DEVICE_IDS]);
    expect(resolveDevices(undefined).map((d) => d.id)).toEqual([...DEFAULT_DEVICE_IDS]);
  });

  it("refuses an unknown profile by name instead of silently sweeping nothing", () => {
    expect(() => resolveDevices(["pixel-9-pro-fold"])).toThrow(/unknown device/i);
  });
});
