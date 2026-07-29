/**
 * The door that decides whether the authenticated app's backdrop moves.
 *
 * Shaped deliberately asymmetrically, like the hero's: every REFUSAL is pinned
 * by its own case, and the accept path is pinned by exactly one hand-built
 * desktop plus a battery of "one field changed" variations that must all flip
 * it back to still.
 *
 * The asymmetry is for a different reason here than on the landing page. There,
 * a false yes spends a teenager's data plan. Here it spends their BATTERY, on
 * every page of a product they are supposed to read for twenty minutes at a
 * time — and it puts moving pixels behind that text, which is the thing the
 * brief for this surface says must not happen.
 */

import { describe, expect, it } from "vitest";
import { UNKNOWN_SIGNALS, type DeviceSignals } from "@/lib/visual/deviceSignals";
import {
  DECK_MIN_CORES,
  DECK_MIN_DEVICE_MEMORY_GB,
  DECK_MIN_VIEWPORT_PX,
  decideDeckRung,
  isDeckStillRoute,
} from "./deckCapability";

/** A machine that should get the drift: wide, mouse-driven, 8 GB, 4G. */
const DESKTOP: DeviceSignals = {
  reducedMotion: false,
  saveData: false,
  effectiveConnectionType: "4g",
  viewportWidthPx: 1680,
  coarsePointer: false,
  anyFinePointer: true,
  deviceMemoryGb: 8,
  hardwareConcurrency: 8,
  webgl: true,
};

/** A mid-range Android — the device this product is actually used on. */
const PHONE: DeviceSignals = {
  reducedMotion: false,
  saveData: false,
  effectiveConnectionType: "4g",
  viewportWidthPx: 390,
  coarsePointer: true,
  anyFinePointer: false,
  deviceMemoryGb: 4,
  hardwareConcurrency: 8,
  webgl: true,
};

describe("the accept path is narrow", () => {
  it("a desktop gets the drift", () => {
    expect(decideDeckRung(DESKTOP)).toEqual({ rung: "depth", reason: null });
  });

  it("and it is the ONLY thing that does", () => {
    // Every single-field change below must close the door. If a new signal is
    // added to the decision and it is not represented here, this list stops
    // being the proof it claims to be.
    const closes: readonly (readonly [string, Partial<DeviceSignals>])[] = [
      ["reduced motion", { reducedMotion: true }],
      ["save data", { saveData: true }],
      ["3g", { effectiveConnectionType: "3g" }],
      ["2g", { effectiveConnectionType: "2g" }],
      ["slow-2g", { effectiveConnectionType: "slow-2g" }],
      ["no viewport", { viewportWidthPx: null }],
      ["narrow window", { viewportWidthPx: DECK_MIN_VIEWPORT_PX - 1 }],
      ["touch primary", { coarsePointer: true, anyFinePointer: false }],
      ["2 GB", { deviceMemoryGb: DECK_MIN_DEVICE_MEMORY_GB - 2 }],
      ["2 cores", { hardwareConcurrency: DECK_MIN_CORES - 2 }],
    ];
    for (const [label, patch] of closes) {
      const decision = decideDeckRung({ ...DESKTOP, ...patch });
      expect(`${label}:${decision.rung}`).toBe(`${label}:still`);
      expect(decision.reason).not.toBeNull();
    }
  });
});

describe("the refusals, each with the reason a student would recognise", () => {
  it.each([
    ["reduced-motion", { reducedMotion: true }],
    ["save-data", { saveData: true }],
    ["slow-network", { effectiveConnectionType: "3g" }],
    ["narrow-viewport", { viewportWidthPx: 800 }],
    ["touch-primary", { coarsePointer: true, anyFinePointer: false }],
    ["low-memory", { deviceMemoryGb: 2 }],
    ["few-cores", { hardwareConcurrency: 2 }],
  ] as const)("reports %s", (reason, patch) => {
    expect(decideDeckRung({ ...DESKTOP, ...patch }).reason).toBe(reason);
  });

  it("consent beats hardware in the reported reason", () => {
    // A reduced-motion student on a 2 GB phone must be told the reason they
    // chose, not the one we inferred — the order of the branches is the whole
    // point, and it matches the hero's door exactly.
    const decision = decideDeckRung({
      ...DESKTOP,
      reducedMotion: true,
      saveData: true,
      deviceMemoryGb: 1,
      viewportWidthPx: 320,
    });
    expect(decision.reason).toBe("reduced-motion");
  });
});

describe("the defaults are the safe ones", () => {
  it("the SSR answer is still, so hydration can never take motion away", () => {
    expect(decideDeckRung(UNKNOWN_SIGNALS)).toEqual({ rung: "still", reason: "server" });
  });

  it("a phone is still, whatever else it reports", () => {
    expect(decideDeckRung(PHONE).rung).toBe("still");
    // …and a WIDE phone/tablet too. The width gate alone would let a landscape
    // tablet through, which is exactly the battery this rung must not spend.
    expect(decideDeckRung({ ...PHONE, viewportWidthPx: 1180 }).reason).toBe("touch-primary");
  });

  it("a touchscreen LAPTOP still gets it", () => {
    // The escape hatch: a laptop with a touchscreen reports coarse for its
    // screen and fine for its trackpad. Refusing it would punish a device that
    // is a desktop in every way that matters here.
    expect(
      decideDeckRung({ ...DESKTOP, coarsePointer: true, anyFinePointer: true }).rung,
    ).toBe("depth");
  });

  it("withheld hardware numbers are not evidence against", () => {
    // deviceMemory is Chromium-only and Safari caps hardwareConcurrency for
    // privacy. Treating `null` as a low number would turn the rung off for
    // every Firefox and Safari desktop.
    expect(
      decideDeckRung({ ...DESKTOP, deviceMemoryGb: null, hardwareConcurrency: null }).rung,
    ).toBe("depth");
  });

  it("WebGL is not consulted at all — the deck never asks for a context", () => {
    // The load-bearing difference from the hero's door. If a `no-webgl` branch
    // ever appears here it means somebody added a canvas to the layout that
    // /simulator also has to live under.
    expect(decideDeckRung({ ...DESKTOP, webgl: false }).rung).toBe("depth");
  });
});

describe("the simulator route is never animated", () => {
  it.each(["/simulator", "/simulator/lesson", "/simulator/lesson/abc"])(
    "%s is a still route",
    (path) => {
      expect(isDeckStillRoute(path)).toBe(true);
    },
  );

  it.each(["/dashboard", "/theory", "/theory/practice", "/simulators", "/exams"])(
    "%s is not",
    (path) => {
      expect(isDeckStillRoute(path)).toBe(false);
    },
  );
});
