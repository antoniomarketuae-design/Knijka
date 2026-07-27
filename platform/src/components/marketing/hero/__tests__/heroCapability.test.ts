/**
 * The gate that decides whether a visitor's device gets the live 3D hero.
 *
 * This is the only place in the marketing surface where a wrong answer costs
 * a real person real money — a false "yes" pushes three.js, a Draco decoder
 * and a 139 KB GLB down a teenager's mobile data plan for a camera move they
 * will scroll past. So the shape of the tests is deliberately asymmetric:
 * every rejection is pinned by its own case, and the ACCEPT path is pinned by
 * exactly one hand-built desktop plus a battery of "one field changed"
 * variations that must all flip it back to the plate.
 */

import { describe, expect, it } from "vitest";
import {
  decideHeroLoop,
  decideHeroStage,
  HERO_MIN_CORES,
  HERO_MIN_DEVICE_MEMORY_GB,
  HERO_MIN_VIEWPORT_PX,
  HERO_SLOW_CONNECTIONS,
  HERO_UNKNOWN_SIGNALS,
  type HeroSignals,
} from "../heroCapability";

/** A machine that should get the scene: wide, mouse-driven, 8 GB, 4G. */
const DESKTOP: HeroSignals = {
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

/** A Galaxy A16 — doc 82 §2.2's phone reference — on a decent cell. */
const MID_RANGE_ANDROID: HeroSignals = {
  reducedMotion: false,
  saveData: false,
  effectiveConnectionType: "4g",
  viewportWidthPx: 411,
  coarsePointer: true,
  anyFinePointer: false,
  deviceMemoryGb: 4,
  hardwareConcurrency: 8,
  webgl: true,
};

const withSignals = (patch: Partial<HeroSignals>): HeroSignals => ({ ...DESKTOP, ...patch });

describe("the accept path", () => {
  it("gives a desktop the live scene", () => {
    expect(decideHeroStage(DESKTOP)).toEqual({ mode: "live3d", reason: null });
  });

  it("accepts a browser that withholds every optional signal", () => {
    // Firefox and Safari report neither deviceMemory nor a connection, and
    // Safari lies about hardwareConcurrency. Gating hard on any of them would
    // silently turn the 3D off for every non-Chromium desktop, which is the
    // most likely way this file gets quietly wrong.
    const privacyBrowser = withSignals({
      effectiveConnectionType: null,
      saveData: null,
      deviceMemoryGb: null,
      hardwareConcurrency: null,
    });
    expect(decideHeroStage(privacyBrowser).mode).toBe("live3d");
  });

  it("accepts a touchscreen laptop — coarse screen, fine trackpad", () => {
    expect(decideHeroStage(withSignals({ coarsePointer: true, anyFinePointer: true })).mode).toBe(
      "live3d",
    );
  });

  it("passes an unprobed WebGL state, because the probe runs last", () => {
    // `readHeroSignals` never creates a GL context; the stage only spends one
    // after everything cheaper has already said yes. `null` must therefore
    // mean "not asked", never "no".
    expect(decideHeroStage(withSignals({ webgl: null })).mode).toBe("live3d");
  });
});

describe("the closed-by-default rule", () => {
  it("refuses on the server, where nothing is knowable", () => {
    expect(decideHeroStage(HERO_UNKNOWN_SIGNALS)).toEqual({ mode: "plate", reason: "server" });
  });

  it("refuses when the viewport width is unknown", () => {
    expect(decideHeroStage(withSignals({ viewportWidthPx: null })).reason).toBe("server");
  });
});

describe("the visitor's own settings win, and are named", () => {
  it("honours prefers-reduced-motion above everything else", () => {
    // Reported reason matters: it is what the DOM attribute shows, and a
    // visitor who set this should see their own choice, not "narrow-viewport".
    const conflicted = withSignals({
      reducedMotion: true,
      saveData: true,
      viewportWidthPx: 320,
      webgl: false,
    });
    expect(decideHeroStage(conflicted)).toEqual({ mode: "plate", reason: "reduced-motion" });
  });

  it("honours save-data next", () => {
    const conflicted = withSignals({ saveData: true, viewportWidthPx: 320, webgl: false });
    expect(decideHeroStage(conflicted)).toEqual({ mode: "plate", reason: "save-data" });
  });
});

describe("network", () => {
  it.each(HERO_SLOW_CONNECTIONS)("refuses on %s", (ect) => {
    expect(decideHeroStage(withSignals({ effectiveConnectionType: ect }))).toEqual({
      mode: "plate",
      reason: "slow-network",
    });
  });

  it("allows 4g and anything the browser reports that we do not know", () => {
    expect(decideHeroStage(withSignals({ effectiveConnectionType: "4g" })).mode).toBe("live3d");
    expect(decideHeroStage(withSignals({ effectiveConnectionType: "5g" })).mode).toBe("live3d");
  });
});

describe("viewport", () => {
  it("refuses one pixel below the threshold and accepts exactly at it", () => {
    expect(decideHeroStage(withSignals({ viewportWidthPx: HERO_MIN_VIEWPORT_PX - 1 }))).toEqual({
      mode: "plate",
      reason: "narrow-viewport",
    });
    expect(decideHeroStage(withSignals({ viewportWidthPx: HERO_MIN_VIEWPORT_PX })).mode).toBe(
      "live3d",
    );
  });
});

describe("device class", () => {
  it("sends the mid-range Android reference device to the plate", () => {
    // The device the whole product is budgeted against (doc 82 §2.2). If this
    // ever returns live3d, the landing page has started shipping the
    // simulator's weight to the median visitor.
    expect(decideHeroStage(MID_RANGE_ANDROID)).toEqual({
      mode: "plate",
      reason: "narrow-viewport",
    });
  });

  it("refuses a wide touch-primary device — a tablet is not a desktop", () => {
    const tablet = withSignals({
      viewportWidthPx: 1180,
      coarsePointer: true,
      anyFinePointer: false,
    });
    expect(decideHeroStage(tablet)).toEqual({ mode: "plate", reason: "touch-primary" });
  });

  it("refuses below the memory floor, and accepts exactly at it", () => {
    expect(
      decideHeroStage(withSignals({ deviceMemoryGb: HERO_MIN_DEVICE_MEMORY_GB - 1 })),
    ).toEqual({ mode: "plate", reason: "low-memory" });
    expect(
      decideHeroStage(withSignals({ deviceMemoryGb: HERO_MIN_DEVICE_MEMORY_GB })).mode,
    ).toBe("live3d");
  });

  it("refuses below the core floor, and accepts exactly at it", () => {
    expect(decideHeroStage(withSignals({ hardwareConcurrency: HERO_MIN_CORES - 1 }))).toEqual({
      mode: "plate",
      reason: "few-cores",
    });
    expect(decideHeroStage(withSignals({ hardwareConcurrency: HERO_MIN_CORES })).mode).toBe(
      "live3d",
    );
  });
});

describe("WebGL", () => {
  it("refuses when a context could not be created", () => {
    expect(decideHeroStage(withSignals({ webgl: false }))).toEqual({
      mode: "plate",
      reason: "no-webgl",
    });
  });
});

describe("the contract the stage relies on", () => {
  it("reports a reason exactly when it refuses", () => {
    const cases: HeroSignals[] = [
      DESKTOP,
      MID_RANGE_ANDROID,
      HERO_UNKNOWN_SIGNALS,
      withSignals({ reducedMotion: true }),
      withSignals({ webgl: false }),
    ];
    for (const signals of cases) {
      const decision = decideHeroStage(signals);
      expect(decision.reason === null).toBe(decision.mode === "live3d");
    }
  });

  it("is pure — the same signals always give the same answer", () => {
    const once = decideHeroStage(DESKTOP);
    const twice = decideHeroStage({ ...DESKTOP });
    expect(twice).toEqual(once);
  });
});

// ---------------------------------------------------------------------------
// The second door: does the FALLBACK move?
// ---------------------------------------------------------------------------

/**
 * `decideHeroLoop` exists because of one founder report — the landing page on
 * a phone, "the car and the road dont move at all so this dont work" — and it
 * is the fix for it, so the thing these tests have to pin is the ASYMMETRY:
 * a device that `decideHeroStage` sends to the plate for a HARDWARE reason
 * must still be shown moving pixels, and a visitor who asked for less motion
 * or fewer bytes must still not be.
 *
 * Getting that backwards is invisible in review (both doors return a plausible
 * decision either way) and only shows up as either a dead hero on every phone,
 * which is the bug we started from, or as an autoplaying video pushed at
 * someone with reduced motion switched on.
 */
describe("the fallback door — decideHeroLoop", () => {
  it("plays on the phone the stage refuses — the whole reason it exists", () => {
    // The one case that must never regress: identical signals, opposite answers.
    expect(decideHeroStage(MID_RANGE_ANDROID).mode).toBe("plate");
    expect(decideHeroLoop(MID_RANGE_ANDROID)).toEqual({ mode: "loop", reason: null });
  });

  it("plays on every device the stage rejects for a hardware reason", () => {
    // A video is fixed-function silicon, not a WebGL runtime. None of these
    // may veto it, and each is a live rejection reason on the other door.
    const hardware: Partial<HeroSignals>[] = [
      { webgl: false },
      { deviceMemoryGb: HERO_MIN_DEVICE_MEMORY_GB - 1 },
      { hardwareConcurrency: HERO_MIN_CORES - 1 },
      { viewportWidthPx: HERO_MIN_VIEWPORT_PX - 1 },
      { coarsePointer: true, anyFinePointer: false },
    ];
    for (const patch of hardware) {
      const signals = withSignals(patch);
      expect(decideHeroStage(signals).mode, JSON.stringify(patch)).toBe("plate");
      expect(decideHeroLoop(signals), JSON.stringify(patch)).toEqual({
        mode: "loop",
        reason: null,
      });
    }
  });

  it("refuses when the visitor asked for less motion", () => {
    expect(decideHeroLoop(withSignals({ reducedMotion: true }))).toEqual({
      mode: "still",
      reason: "reduced-motion",
    });
  });

  it("refuses when the visitor asked to save data", () => {
    expect(decideHeroLoop(withSignals({ saveData: false, reducedMotion: false }))).toEqual({
      mode: "loop",
      reason: null,
    });
    expect(decideHeroLoop(withSignals({ saveData: true }))).toEqual({
      mode: "still",
      reason: "save-data",
    });
  });

  it("refuses on every connection class the stage calls slow", () => {
    for (const effectiveConnectionType of HERO_SLOW_CONNECTIONS) {
      expect(decideHeroLoop(withSignals({ effectiveConnectionType }))).toEqual({
        mode: "still",
        reason: "slow-network",
      });
    }
  });

  it("reports the visitor's own choice ahead of anything we inferred", () => {
    // Reduced motion AND a 2g cell: the reason surfaced on `data-hero-loop-
    // decline` should be the one they would recognise as theirs.
    expect(
      decideHeroLoop(withSignals({ reducedMotion: true, effectiveConnectionType: "2g" })).reason,
    ).toBe("reduced-motion");
  });

  it("is still on the server — the plate is the pre-hydration answer", () => {
    // A <video autoplay preload="auto"> in the server HTML would be fetched by
    // the preload scanner before a single signal had been read.
    expect(decideHeroLoop(HERO_UNKNOWN_SIGNALS)).toEqual({ mode: "still", reason: "server" });
  });

  it("reports a reason exactly when it refuses", () => {
    const cases: HeroSignals[] = [
      DESKTOP,
      MID_RANGE_ANDROID,
      HERO_UNKNOWN_SIGNALS,
      withSignals({ saveData: true }),
      withSignals({ webgl: false }),
    ];
    for (const signals of cases) {
      const decision = decideHeroLoop(signals);
      expect(decision.reason === null).toBe(decision.mode === "loop");
    }
  });
});
