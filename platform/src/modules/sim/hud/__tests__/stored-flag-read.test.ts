/**
 * `readStoredFlagOrNull`, EXECUTED — lane E round 2.
 *
 * The round-1 verifier replaced its body with `return null` and the whole hud +
 * lesson-ui suite stayed green: the function reads `window.localStorage`, the
 * suite runs in `environment: "node"`, and the only thing holding it was a
 * source match that the shell calls it. `return null` is not a harmless
 * mutant — it is the student's stored «Инструкции при старт» choice silently
 * ignored on every load (a phone opt-in never opens the card, a laptop
 * opt-out always does).
 *
 * So this file stubs `window` with a real-shaped store and runs the function
 * against every value the store can hand back. The wire format is the one
 * `serializeFlag` writes — "on" / "off" — so "1" / "0" are FOREIGN values here
 * (null), exactly as a garbage string is.
 *
 * The other half — that the shell hands this result to the start machine — is
 * the wiring pin in `briefing-auto-open.test.ts` («the stored choice is read
 * with readStoredFlagOrNull and handed to the start machine»).
 */

import { afterEach, describe, expect, it, vi } from "vitest";
import {
  BRIEFING_AUTO_STORAGE_KEY,
  readStoredFlagOrNull,
  serializeFlag,
  writeStoredFlag,
} from "../hudPreferences";
import { briefingAutoSetting } from "../briefingStart";

function stubStore(initial: Record<string, string> = {}): Map<string, string> {
  const data = new Map(Object.entries(initial));
  vi.stubGlobal("window", {
    localStorage: {
      getItem: (k: string) => (data.has(k) ? data.get(k)! : null),
      setItem: (k: string, v: string) => void data.set(k, String(v)),
      removeItem: (k: string) => void data.delete(k),
    },
  });
  return data;
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("readStoredFlagOrNull reads the store (no default folded in)", () => {
  it('stored "on" → true', () => {
    stubStore({ [BRIEFING_AUTO_STORAGE_KEY]: "on" });
    expect(readStoredFlagOrNull(BRIEFING_AUTO_STORAGE_KEY)).toBe(true);
  });

  it('stored "off" → false', () => {
    stubStore({ [BRIEFING_AUTO_STORAGE_KEY]: "off" });
    expect(readStoredFlagOrNull(BRIEFING_AUTO_STORAGE_KEY)).toBe(false);
  });

  it("nothing stored → null (the per-surface default is applied later)", () => {
    stubStore();
    expect(readStoredFlagOrNull(BRIEFING_AUTO_STORAGE_KEY)).toBeNull();
  });

  it('a foreign value ("1", "0", "true", garbage) → null, never a guess', () => {
    for (const v of ["1", "0", "true", "false", "ON", "garbage", ""]) {
      stubStore({ [BRIEFING_AUTO_STORAGE_KEY]: v });
      expect(readStoredFlagOrNull(BRIEFING_AUTO_STORAGE_KEY), `stored ${JSON.stringify(v)}`).toBeNull();
    }
  });

  it("reads THE KEY IT IS GIVEN, not a neighbour", () => {
    stubStore({ "some.other.key": "on" });
    expect(readStoredFlagOrNull(BRIEFING_AUTO_STORAGE_KEY)).toBeNull();
    stubStore({ "some.other.key": "off", [BRIEFING_AUTO_STORAGE_KEY]: "on" });
    expect(readStoredFlagOrNull("some.other.key")).toBe(false);
  });

  it("a throwing store (Safari private mode) → null", () => {
    vi.stubGlobal("window", {
      localStorage: {
        getItem: () => {
          throw new Error("SecurityError");
        },
      },
    });
    expect(readStoredFlagOrNull(BRIEFING_AUTO_STORAGE_KEY)).toBeNull();
  });

  it("SSR (no window) → null", () => {
    vi.stubGlobal("window", undefined);
    expect(readStoredFlagOrNull(BRIEFING_AUTO_STORAGE_KEY)).toBeNull();
  });

  it("round-trips what the МЕНЮ toggle writes", () => {
    const data = stubStore();
    for (const on of [true, false]) {
      writeStoredFlag(BRIEFING_AUTO_STORAGE_KEY, on);
      expect(data.get(BRIEFING_AUTO_STORAGE_KEY)).toBe(serializeFlag(on));
      expect(readStoredFlagOrNull(BRIEFING_AUTO_STORAGE_KEY)).toBe(on);
    }
  });

  it("END TO END: a stored choice overrides the surface default through the read", () => {
    // Phone opt-in opens; laptop opt-out closes — both need the read to work.
    stubStore({ [BRIEFING_AUTO_STORAGE_KEY]: "on" });
    expect(briefingAutoSetting(true, readStoredFlagOrNull(BRIEFING_AUTO_STORAGE_KEY))).toBe(true);
    stubStore({ [BRIEFING_AUTO_STORAGE_KEY]: "off" });
    expect(briefingAutoSetting(false, readStoredFlagOrNull(BRIEFING_AUTO_STORAGE_KEY))).toBe(false);
  });
});
