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
 *
 * EXCEPT THAT IT DID NOT RUN, AND THAT IS WHY THE PIN BELOW WAS WRONG. From the
 * day the vitest include glob was narrowed off `../tools/mobile/**\/*.test.mjs`
 * until 2026-08-19, this file was filtered out of `node --test` (it imports
 * vitest) and matched by no vitest glob. On 2026-08-11 commit 96a3ea5 — "a
 * six-phone ladder with real notches, and probes that must prove they can still
 * go red" — added the two Samsung `galaxy-gesturebar-*` profiles, and the
 * geometry table here still listed four. The first execution of this file
 * failed on exactly that. The file is named explicitly in `VITEST_INCLUDE`
 * (platform/scripts/tools-tests.mjs) now, and both gates fail if it stops being
 * named there.
 */
/**
 * The rotated counterpart of `device` inside `ladder` — same phone, turned.
 *
 * `ua` is the family key because it is the one field that is identical across a
 * phone's two orientations and different between phones: the safe area rotates
 * with the device, and the geometry is shared by two families since the Samsung
 * rows landed.
 */
function rotatedCounterpart(device, ladder) {
  return Object.values(ladder).find(
    (other) =>
      other.id !== device.id &&
      other.ua === device.ua &&
      other.width === device.height &&
      other.height === device.width,
  );
}

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
    //
    // MEASURED 2026-08-19, on this file's first ever execution: the table said
    // four profiles and `DEVICES` held six. The two Samsung rows had been in
    // the ladder for eight days.
    const geometry = Object.fromEntries(
      Object.values(DEVICES).map((d) => [d.id, `${d.width}x${d.height}`]),
    );
    expect(geometry).toEqual({
      "iphone16-portrait": "393x852",
      "iphone16-landscape": "852x393",
      "small-portrait": "360x780",
      "small-landscape": "780x360",
      "galaxy-gesturebar-portrait": "360x780",
      "galaxy-gesturebar-landscape": "780x360",
    });
  });

  it("pins the safe-area bands, which is the ONLY thing separating two of these rows", () => {
    // Geometry alone cannot see this. `galaxy-gesturebar-portrait` is 360x780,
    // the same viewport as `small-portrait` on purpose, so the pair is a
    // controlled A/B in which the inset is the only variable — devices.mjs says
    // so in its own comment. If that 24 ever silently became 0 the Samsung rows
    // would collapse into duplicates of the Pixel rows, the geometry pin above
    // would still pass, and every report claiming this product was measured
    // against an Android 15 gesture bar would be false. The driving controls
    // sit in that band.
    //
    // The zeros are as load-bearing as the numbers: small-* is the deliberate
    // control that proves the inset emulation does something on the other rows.
    const bands = Object.fromEntries(
      Object.values(DEVICES).map((d) => [
        d.id,
        `${d.safeArea.top}/${d.safeArea.right}/${d.safeArea.bottom}/${d.safeArea.left}`,
      ]),
    );
    expect(bands).toEqual({
      "iphone16-portrait": "59/0/34/0",
      "iphone16-landscape": "0/59/21/59",
      "small-portrait": "0/0/0/0",
      "small-landscape": "0/0/0/0",
      "galaxy-gesturebar-portrait": "0/0/24/0",
      "galaxy-gesturebar-landscape": "0/0/24/0",
    });
  });

  it("pairs every profile with its own rotation, WITHIN ITS OWN DEVICE FAMILY", () => {
    // A ladder with a portrait that has no landscape is how „it all have to be
    // on the screen without scrolling" gets answered for one orientation only.
    //
    // The family clause was added 2026-08-19 and is not decoration. Since the
    // Samsung pair arrived, two families share the 360x780 / 780x360 geometry,
    // so a match on dimensions alone can be satisfied by a DIFFERENT phone —
    // and the next test proves that is not theoretical.
    for (const device of Object.values(DEVICES)) {
      const rotated = rotatedCounterpart(device, DEVICES);
      expect(rotated, `${device.id} has no rotated counterpart in its own family`).toBeDefined();
      expect(rotated.orientation).not.toBe(device.orientation);
    }
  });

  it("…and the family clause can fail: a half-added phone may not borrow another's landscape", () => {
    // The mutation, run rather than argued. Take the ladder that exists and
    // remove one half of the Samsung pair — precisely the commit this file is
    // meant to stop.
    const halfAdded = { ...DEVICES };
    delete halfAdded["galaxy-gesturebar-landscape"];
    const orphan = halfAdded["galaxy-gesturebar-portrait"];

    // Dimensions alone still find one: `small-landscape` is also 780x360 and
    // also declares itself landscape. That is the false pass — a green tick for
    // a rotation nobody added.
    const byGeometryOnly = Object.values(halfAdded).find(
      (o) => o.id !== orphan.id && o.width === orphan.height && o.height === orphan.width,
    );
    expect(byGeometryOnly?.id).toBe("small-landscape");

    // The rule the test above actually uses says no.
    expect(rotatedCounterpart(orphan, halfAdded)).toBeUndefined();
  });

  it("resolves the default ladder when a caller names no device", () => {
    expect(resolveDevices([]).map((d) => d.id)).toEqual([...DEFAULT_DEVICE_IDS]);
    expect(resolveDevices(undefined).map((d) => d.id)).toEqual([...DEFAULT_DEVICE_IDS]);
  });

  it("refuses an unknown profile by name instead of silently sweeping nothing", () => {
    expect(() => resolveDevices(["pixel-9-pro-fold"])).toThrow(/unknown device/i);
  });
});
