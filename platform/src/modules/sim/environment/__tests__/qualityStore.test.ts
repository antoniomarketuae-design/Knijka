/**
 * The STORE half of the quality decision — the part that was never tested,
 * which is precisely where the defect lived.
 *
 * `quality.test.ts` covers the pure ruling: which tier a set of device signals
 * earns, and which tier a measured window earns. Both were correct. What was
 * broken was the plumbing between them: `seedQualityLevel()` memoizes its
 * answer for the whole page load, and /simulator is a client-routed React app
 * that never reloads the document between lessons. So the probe could measure
 * this device drowning, write the verdict down, and the product would keep
 * handing out the tier it decided on before the first lesson — for the whole
 * session. "Applied at the next cold start" was true of the store and false of
 * the product.
 *
 * These tests run in the node environment (vitest.config.ts), so they install
 * the two browser globals the store actually reads. That is deliberate: a
 * jsdom-only test would not have caught this either, because the bug is about
 * WHEN the memo is dropped, not about the DOM.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/** The narrowest fake that satisfies `readDeviceSignals` + the ledger reads. */
function installBrowser(signals: {
  coarse: boolean;
  anyFine: boolean;
  memory?: number;
  cores?: number;
  dpr: number;
}) {
  const store = new Map<string, string>();
  const localStorage = {
    getItem: (k: string) => store.get(k) ?? null,
    setItem: (k: string, v: string) => void store.set(k, v),
    removeItem: (k: string) => void store.delete(k),
  };
  const win = {
    localStorage,
    devicePixelRatio: signals.dpr,
    matchMedia: (query: string) => ({
      matches:
        query === "(pointer: coarse)"
          ? signals.coarse
          : query === "(any-pointer: fine)"
            ? signals.anyFine
            : false,
    }),
  };
  vi.stubGlobal("window", win);
  vi.stubGlobal("localStorage", localStorage);
  vi.stubGlobal("navigator", {
    deviceMemory: signals.memory,
    hardwareConcurrency: signals.cores,
  });
  return store;
}

/** A phone: coarse pointer, no fine pointer anywhere, dense panel. */
const PHONE = { coarse: true, anyFine: false, memory: 8, cores: 8, dpr: 3 };
/** A laptop: fine pointer. */
const LAPTOP = { coarse: false, anyFine: true, memory: 8, cores: 8, dpr: 1 };

const LEDGER_KEY = "aidrive.sim.quality.ledger.v1";

/** Fresh module instance per test — the memo under test is module state. */
async function freshStore() {
  vi.resetModules();
  return import("../qualityStore");
}

beforeEach(() => {
  vi.unstubAllGlobals();
});
afterEach(() => {
  vi.unstubAllGlobals();
});

describe("seedQualityLevel / refreshSeededQuality", () => {
  it("seeds a phone low even when it reports 8 GB", async () => {
    installBrowser(PHONE);
    const { seedQualityLevel } = await freshStore();
    expect(seedQualityLevel()).toBe("low");
  });

  it("memoizes, so a ledger written mid-session cannot move a live canvas", async () => {
    const storage = installBrowser(PHONE);
    const { seedQualityLevel } = await freshStore();
    expect(seedQualityLevel()).toBe("low");
    // The probe finishes and writes a promotion while the student is driving.
    storage.set(LEDGER_KEY, JSON.stringify({ earned: "med", failedAt: null }));
    // The tier under the live canvas MUST NOT move: low → med is a 5.2 MB
    // texture fetch starting under the student's wheels.
    expect(seedQualityLevel()).toBe("low");
  });

  it("re-reads the measurement at the between-lessons seam", async () => {
    const storage = installBrowser(PHONE);
    const { seedQualityLevel, refreshSeededQuality } = await freshStore();
    expect(seedQualityLevel()).toBe("low");
    storage.set(LEDGER_KEY, JSON.stringify({ earned: "med", failedAt: null }));
    // THE FIX. The canvas is unmounted, no drive is in progress, and the next
    // lesson has not chosen its download plan — the one moment a tier change
    // costs nothing. Without this call the measurement only reached the student
    // on a hard refresh.
    expect(refreshSeededQuality()).toBe("med");
    expect(seedQualityLevel()).toBe("med");
  });

  it("demotes at the seam too, and the phone ceiling still binds", async () => {
    const storage = installBrowser(PHONE);
    const { refreshSeededQuality } = await freshStore();
    storage.set(LEDGER_KEY, JSON.stringify({ earned: "med", failedAt: null }));
    expect(refreshSeededQuality()).toBe("med");
    // The probe then measures med failing here.
    storage.set(LEDGER_KEY, JSON.stringify({ earned: "low", failedAt: "med" }));
    expect(refreshSeededQuality()).toBe("low");
    // And no ledger may ever buy a handset into `high`.
    storage.set(LEDGER_KEY, JSON.stringify({ earned: "high", failedAt: null }));
    expect(refreshSeededQuality()).toBe("med");
  });
});

describe("canvasMaxDpr", () => {
  it("clamps a handset to 1.0 on every tier, whatever its panel reports", async () => {
    installBrowser(PHONE); // devicePixelRatio 3
    const { canvasMaxDpr } = await freshStore();
    expect(canvasMaxDpr("low")).toBe(1);
    expect(canvasMaxDpr("med")).toBe(1);
    expect(canvasMaxDpr("high")).toBe(1);
  });

  it("leaves a pointing device on the preset's own cap", async () => {
    installBrowser(LAPTOP);
    const { canvasMaxDpr } = await freshStore();
    const { QUALITY_PRESETS } = await import("../quality");
    expect(canvasMaxDpr("low")).toBe(QUALITY_PRESETS.low.maxDpr);
    expect(canvasMaxDpr("med")).toBe(QUALITY_PRESETS.med.maxDpr);
    expect(canvasMaxDpr("high")).toBe(QUALITY_PRESETS.high.maxDpr);
  });
});

describe("the render heartbeat", () => {
  it("counts frames the RENDERER drew, not frames rAF ticked", async () => {
    installBrowser(PHONE);
    const { noteRenderedFrame, renderedFrameCount, MIN_RENDERED_FRACTION } = await freshStore();
    const before = renderedFrameCount();
    noteRenderedFrame();
    noteRenderedFrame();
    expect(renderedFrameCount() - before).toBe(2);
    // The probe throws a window away below this fraction. A paused scene on a
    // "demand" frameloop scores ~0 while rAF happily reports 60 Hz.
    expect(MIN_RENDERED_FRACTION).toBeGreaterThan(0.5);
    expect(MIN_RENDERED_FRACTION).toBeLessThanOrEqual(1);
  });
});
