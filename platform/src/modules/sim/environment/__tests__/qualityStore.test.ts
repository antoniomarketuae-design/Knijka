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

  /* ═════════════════════════════════════════════════════════════════════════
     …AND THE SEAM HAS TO REACH THE STORE, NOT ONLY ITS CALLER — 2026-08-26.

     Every row above reads `refreshSeededQuality()`'s RETURN VALUE, and all four
     stayed green while the store itself never moved: `state.recommendation` is
     written exactly once, by `loadStored()` at module init, and it is what
     `effectiveQuality()` answers for a student on `auto`. `LessonSelectScreen`
     calls this function and discards the return value, so the measurement
     reached `seedQualityLevel()` and stopped there.

     The rows below assert the OTHER end of the wire — the one the canvas
     actually reads (`SimEnvironment.tsx:146`, `WindshieldDroplets.tsx:190`, both
     through `useQuality()` → `effectiveQuality(getQualityState())`). They fail
     if `setQualityRecommendation` loses its only caller, which is the state this
     module was in for the whole of the repair round that wrote it.
     ═══════════════════════════════════════════════════════════════════════ */
  it("the refreshed tier LANDS IN THE STORE the canvas reads", async () => {
    const storage = installBrowser(PHONE);
    const { refreshSeededQuality, effectiveQuality, getQualityState } = await freshStore();
    expect(effectiveQuality(getQualityState())).toBe("low");
    storage.set(LEDGER_KEY, JSON.stringify({ earned: "med", failedAt: null }));
    refreshSeededQuality();
    // NOT `refreshSeededQuality()`'s answer — the store's. This is the read
    // `useQuality()` performs, and before the wire it still said "low".
    expect(getQualityState().recommendation).toBe("med");
    expect(effectiveQuality(getQualityState())).toBe("med");
  });

  it("…and it notifies subscribers, so a mounted canvas is not left stale", async () => {
    const storage = installBrowser(PHONE);
    const { refreshSeededQuality, subscribeQuality } = await freshStore();
    let notified = 0;
    const stop = subscribeQuality(() => {
      notified += 1;
    });
    storage.set(LEDGER_KEY, JSON.stringify({ earned: "med", failedAt: null }));
    refreshSeededQuality();
    expect(notified).toBe(1);
    // An unchanged tier is a no-op — `useSyncExternalStore` must not be woken
    // for a value that did not move, on the one screen where a re-render costs
    // the whole R3F tree.
    refreshSeededQuality();
    expect(notified).toBe(1);
    stop();
  });

  it("…and a student's own choice still outranks the measurement", async () => {
    // The direction that must NOT regress: `setting` is the student's, and a
    // recommendation is only ever consulted while `setting === "auto"`.
    const storage = installBrowser(PHONE);
    const { refreshSeededQuality, setQualitySetting, effectiveQuality, getQualityState } =
      await freshStore();
    setQualitySetting("low");
    storage.set(LEDGER_KEY, JSON.stringify({ earned: "med", failedAt: null }));
    refreshSeededQuality();
    expect(getQualityState().recommendation).toBe("med");
    expect(effectiveQuality(getQualityState())).toBe("low");
  });
});

describe("canvasMaxDpr", () => {
  it("walks a handset UP a resolution ladder whose rungs are each paid for", async () => {
    installBrowser(PHONE); // devicePixelRatio 3
    const { canvasMaxDpr } = await freshStore();
    // `low` — the cold start of every touch-only device and the tier a failed
    // one returns to. No frame time has ever been produced here, so no fill is
    // spent here.
    expect(canvasMaxDpr("low")).toBe(1);
    // `med` — unreachable by guessing (the seed returns `low` for every phone),
    // so a device on it has cleared 57 fps over 60+ clean frames. THIS is the
    // rung the founder's default path actually lands on, and it is why „we
    // shipped dpr 3" stopped being the same sentence as „his phone renders
    // dpr 3": with nothing pressed, the deployed build gave him 393×852.
    expect(canvasMaxDpr("med")).toBe(2);
    // §I26(c) / the founder's ruling: the top tier is only reachable by an
    // explicit press in the lesson menu, and when it is reached the phone
    // renders the pixels its screen actually has.
    expect(canvasMaxDpr("high")).toBe(3);
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

describe("a tier changed mid-window voids the probe's sample (§I26(c))", () => {
  it("starts valid and latches void the moment the EFFECTIVE tier moves", async () => {
    installBrowser(PHONE);
    const { setQualitySetting, isQualityProbeWindowVoid, effectiveQuality, getQualityState } =
      await freshStore();
    expect(isQualityProbeWindowVoid()).toBe(false);
    expect(effectiveQuality(getQualityState())).toBe("low"); // seeded
    // The student opens the lesson menu mid-drive and asks for «Високо».
    setQualitySetting("high");
    expect(effectiveQuality(getQualityState())).toBe("high");
    // The window that was open was collecting frames at `low` and would have
    // filed them under `low` — `ledgerFromSample` would then have PROMOTED this
    // device on the strength of a tier it never ran.
    expect(isQualityProbeWindowVoid()).toBe(true);
  });

  it("does not void on a no-op press — the same tier chosen explicitly", async () => {
    installBrowser(PHONE);
    const { setQualitySetting, isQualityProbeWindowVoid } = await freshStore();
    // Seed is `low`; choosing `low` by hand changes the SETTING but not what is
    // on screen, so the frames in flight are still honest evidence about `low`.
    setQualitySetting("low");
    expect(isQualityProbeWindowVoid()).toBe(false);
  });

  it("stays void for the rest of the page load, including a return to auto", async () => {
    installBrowser(PHONE);
    const { setQualitySetting, isQualityProbeWindowVoid } = await freshStore();
    setQualitySetting("med");
    expect(isQualityProbeWindowVoid()).toBe(true);
    setQualitySetting("auto"); // back to the seeded `low`
    expect(isQualityProbeWindowVoid()).toBe(true);
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
