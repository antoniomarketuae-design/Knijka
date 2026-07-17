/**
 * Reverse-view setting store. Runs in the node environment: `window` is
 * stubbed per case and the module is re-imported so the load-time read of
 * localStorage is exercised for real (that read is the whole point of the
 * store — it is where a persisted opt-out comes back).
 */

import { afterEach, describe, expect, it, vi } from "vitest";

type Store = typeof import("../reverseViewStore");

/** Import the store fresh against a stubbed localStorage. */
async function loadStore(
  stored: string | null,
  writes: Array<[string, string]> = [],
): Promise<Store> {
  vi.stubGlobal("window", {
    localStorage: {
      getItem: () => stored,
      setItem: (k: string, v: string) => {
        writes.push([k, v]);
      },
    },
  });
  vi.resetModules();
  return import("../reverseViewStore");
}

afterEach(() => {
  vi.unstubAllGlobals();
  vi.resetModules();
});

describe("reverseViewStore", () => {
  it("ships ON — the student opts OUT of looking back, never in", async () => {
    const store = await loadStore(null);
    expect(store.getReverseViewEnabled()).toBe(true);
  });

  it("keys off aidrive.sim.reverseView.v1", async () => {
    const store = await loadStore(null);
    expect(store.REVERSE_VIEW_STORAGE_KEY).toBe("aidrive.sim.reverseView.v1");
  });

  it("restores a persisted opt-out, and round-trips its own wire format", async () => {
    const writes: Array<[string, string]> = [];
    const store = await loadStore(null, writes);
    store.setReverseViewEnabled(false);
    expect(writes).toEqual([["aidrive.sim.reverseView.v1", "false"]]);

    const reloaded = await loadStore(writes[0][1]);
    expect(reloaded.getReverseViewEnabled()).toBe(false);
  });

  it("ignores a foreign/corrupt stored value instead of breaking the view", async () => {
    for (const raw of ["yes", "{}", "null", "["]) {
      const store = await loadStore(raw);
      expect(store.getReverseViewEnabled()).toBe(true);
    }
  });

  it("survives storage being unavailable (private mode, quota)", async () => {
    vi.stubGlobal("window", {
      localStorage: {
        getItem: () => {
          throw new Error("blocked");
        },
        setItem: () => {
          throw new Error("blocked");
        },
      },
    });
    vi.resetModules();
    const store: Store = await import("../reverseViewStore");
    expect(store.getReverseViewEnabled()).toBe(true);
    expect(() => store.setReverseViewEnabled(false)).not.toThrow();
    // The session still honours the choice — it just won't be remembered.
    expect(store.getReverseViewEnabled()).toBe(false);
  });

  it("defaults ON with no window at all (SSR)", async () => {
    vi.stubGlobal("window", undefined);
    vi.resetModules();
    const store: Store = await import("../reverseViewStore");
    expect(store.getReverseViewEnabled()).toBe(true);
    expect(() => store.setReverseViewEnabled(false)).not.toThrow();
  });

  it("toggles, and notifies subscribers exactly on change", async () => {
    const store = await loadStore(null);
    let notified = 0;
    const unsubscribe = store.subscribeReverseView(() => notified++);

    store.toggleReverseViewEnabled();
    expect(store.getReverseViewEnabled()).toBe(false);
    expect(notified).toBe(1);

    store.setReverseViewEnabled(false); // no change → no churn in the legend
    expect(notified).toBe(1);

    store.toggleReverseViewEnabled();
    expect(store.getReverseViewEnabled()).toBe(true);
    expect(notified).toBe(2);

    unsubscribe();
    store.toggleReverseViewEnabled();
    expect(notified).toBe(2);
  });
});
