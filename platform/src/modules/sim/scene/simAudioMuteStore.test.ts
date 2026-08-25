/**
 * =============================================================================
 * ONE OWNER FOR THE MUTE BIT — sweep w10, 2026-08-25.
 * =============================================================================
 *
 * The nine „no audio, and no way to control it" rows are answered by a ⚙ sheet
 * row (`lesson-ui/soundChoice.ts` + its test). This file holds the half that
 * makes the row honest: the bit it writes is the SAME bit `SimAudio` reads and
 * the SAME bit the M key flips.
 *
 * WHY THAT NEEDS A GATE AT ALL. `SimAudio` used to own `mutedValue` privately.
 * The obvious repair — a store that mirrors it — leaves two places that must
 * agree with nothing making them, which is the drift this codebase has paid for
 * three times (`overlayQueue.ts`'s census, `dashboardStatus.ts`'s weather
 * vocabulary, `GovernorCapMark`'s hand-kept `modeAboveLaw`). The bit therefore
 * MOVED rather than being copied, and these cases are what stops it moving
 * back: a future edit that re-adds a private field would leave the row's word
 * and the mix disagreeing, silently, with every unit test still green.
 *
 * EVERY CASE WAS MUTATION-PROVED; the mutation is named beside each one.
 */

import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  __resetSimAudioMutedForTests,
  getSimAudioMuted,
  setSimAudioMuted,
  subscribeSimAudioMuted,
  toggleSimAudioMuted,
} from "./simAudioMuteStore";

/**
 * THE SUITE IS `environment: "node"` AND STAYS THAT WAY — vitest.config.ts,
 * and its coverage block says so outright („there is no DOM environment
 * configured"). So the storage half is driven against a stubbed `window`
 * rather than by pulling jsdom in behind one file: the module reads `window`
 * at CALL time inside `persist()`/`loadStored()`, so a stub exercises the real
 * branch, and the un-stubbed cases then prove the SSR path for free.
 */
function stubStorage(): Map<string, string> {
  const store = new Map<string, string>();
  vi.stubGlobal("window", {
    localStorage: {
      getItem: (k: string) => store.get(k) ?? null,
      setItem: (k: string, v: string) => void store.set(k, v),
      removeItem: (k: string) => void store.delete(k),
    },
  });
  return store;
}

beforeEach(() => {
  __resetSimAudioMutedForTests(false);
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("the store owns the bit", () => {
  /**
   * DEFAULT NOT MUTED — doc 82 §4.4, and it is pedagogy rather than taste: a
   * muted session teaches a systematically faster car (~3.2 km/h of
   * over-production) than the student will really drive.
   *
   * MUTATION: flip `DEFAULT_MUTED` to true. Red.
   */
  it("starts with the sound on", () => {
    expect(getSimAudioMuted()).toBe(false);
  });

  /**
   * MUTATION: drop the `if (next === muted) return;` guard — the listener then
   * fires on a no-op write and the „only on a real change" assertion goes red.
   * That guard is what keeps a re-render from being scheduled every time an
   * unrelated setting is saved.
   */
  it("notifies subscribers on a real change and not on a no-op", () => {
    const seen = vi.fn();
    const off = subscribeSimAudioMuted(seen);

    setSimAudioMuted(true);
    expect(getSimAudioMuted()).toBe(true);
    expect(seen).toHaveBeenCalledTimes(1);

    setSimAudioMuted(true);
    expect(seen).toHaveBeenCalledTimes(1);

    off();
    setSimAudioMuted(false);
    expect(seen).toHaveBeenCalledTimes(1);
    expect(getSimAudioMuted()).toBe(false);
  });

  /**
   * THE M KEY AND THE ⚙ ROW ARE THE SAME ACT. `SimAudio.toggleMute()` calls
   * `setSimAudioMuted(!getSimAudioMuted())` and the row calls this; both land
   * on one value, so the row's word can never describe a state the mix is not
   * in.
   *
   * MUTATION: make `toggleSimAudioMuted` assign `true` instead of negating.
   * Red on the second toggle.
   */
  it("toggles back and forth from either door", () => {
    toggleSimAudioMuted();
    expect(getSimAudioMuted()).toBe(true);
    toggleSimAudioMuted();
    expect(getSimAudioMuted()).toBe(false);
  });

  /**
   * THE KEY AND ITS ENCODING ARE `SimAudio`'S OWN — `knijka.sim.muted`, "1"/"0"
   * — because this is a change of OWNER, not a change of SETTING. A new key, or
   * JSON instead of "1", would silently un-mute every student who had already
   * chosen silence.
   *
   * MUTATION: change `STORAGE_KEY` to "knijka.sim.mutedV2", or persist
   * `JSON.stringify(muted)`. Red on both halves.
   */
  it("persists to SimAudio's own key in SimAudio's own encoding", () => {
    const store = stubStorage();
    setSimAudioMuted(true);
    expect(store.get("knijka.sim.muted")).toBe("1");
    setSimAudioMuted(false);
    expect(store.get("knijka.sim.muted")).toBe("0");
  });

  /**
   * THE TEST HOOK MAY NOT UNSUBSCRIBE THE PRODUCT.
   *
   * `__resetSimAudioMutedForTests` first shipped calling `listeners.clear()`,
   * which is a trap with a long fuse rather than a bug today: the subscribers
   * here are a live `SimAudio` (its constructor) and every mounted
   * `useSimAudioMuted()`, so the first suite that renders the shell and THEN
   * resets would watch the ⚙ row stop updating and read it as a wiring bug in
   * code that is correct. Subscribers own their own unsubscribe.
   *
   * MUTATION: restore `listeners.clear()` in the reset hook. Red on both halves
   * — the reset itself no longer notifies, and the later change is unheard.
   */
  it("survives the test hook — a reset changes the value, not who is listening", () => {
    const seen = vi.fn();
    const off = subscribeSimAudioMuted(seen);

    __resetSimAudioMutedForTests(true);
    expect(getSimAudioMuted()).toBe(true);
    // A reset is a change of value, so it announces itself like one.
    expect(seen).toHaveBeenCalledTimes(1);

    setSimAudioMuted(false);
    expect(seen).toHaveBeenCalledTimes(2);
    off();
  });

  /**
   * THE SSR PATH, and it is not hypothetical: this module is imported by
   * `LessonPlayShell`, which Next evaluates on the server before it ever
   * hydrates. A store that threw there would take the whole /simulator route
   * down with it.
   *
   * MUTATION: drop either `typeof window === "undefined"` guard. Red — the
   * un-stubbed `window` reference throws exactly the ReferenceError this case
   * exists to forbid.
   */
  it("survives having no window at all", () => {
    expect(() => setSimAudioMuted(true)).not.toThrow();
    expect(getSimAudioMuted()).toBe(true);
    expect(() => toggleSimAudioMuted()).not.toThrow();
    expect(getSimAudioMuted()).toBe(false);
  });
});

/**
 * …AND `SimAudio` STILL DELEGATES — the case that stops the bit moving back.
 *
 * `SimAudio` cannot be constructed here: it reaches for `window.localStorage`
 * and `window.AudioContext`, and building the graph is the whole of what a node
 * environment cannot do. What CAN be held, and is the thing actually at risk, is
 * that the class has no mute field of its own. A future edit that re-adds
 * `private mutedValue` would leave the ⚙ row's word and the audible mix
 * disagreeing — silently, with every other test in this file still green,
 * because they would all still be asserting about the store.
 *
 * Normalised for CRLF for `soundChoice.test.ts`'s reason.
 */
describe("SimAudio has no mute field of its own", () => {
  const SRC = readFileSync(resolve(__dirname, "./simAudio.ts"), "utf8").replace(/\r\n/g, "\n");
  const LIVE = SRC.split("\n")
    .filter((l) => {
      const t = l.trim();
      return t !== "" && !t.startsWith("//") && !t.startsWith("*") && !t.startsWith("/*");
    })
    .join("\n");

  /**
   * MUTATION: restore `private mutedValue = false;` and have `get muted()`
   * return it. Red.
   */
  it("keeps no private copy of the bit", () => {
    expect(LIVE).not.toContain("mutedValue");
  });

  /**
   * MUTATION: revert `effectiveVolume()` to `this.mutedValue ? 0 : …`. Red —
   * and this is the read that actually silences the mix, so a version of this
   * file that passed the case above but failed this one would show the right
   * word on the row over audible sound.
   */
  it("reads the store on the gain path and writes it on the M key", () => {
    expect(LIVE).toContain("getSimAudioMuted() ? 0 : this.volumeValue");
    expect(LIVE).toContain("setSimAudioMuted(!getSimAudioMuted())");
  });

  /**
   * ONE WRITER FOR THE KEY. `persist()` used to write the mute key from the
   * class's own stale copy; leaving that in beside the store's writer is the
   * two-owners defect wearing the fix's clothes.
   *
   * ⚠ THE FIRST VERSION OF THIS CASE HELD A DEAD SYMBOL. It asserted
   * `toContain("VOLUME_KEY")` — i.e. that a constant exists — inside the very
   * patch that made `persist()` cold: its only remaining caller is `setVolume`,
   * and `setVolume` has no caller anywhere outside this file. A presence pin on
   * a symbol no production path reaches is this programme's signature defect,
   * and it does not get to appear in the patch that cites it. So the assertion
   * is now a CONDITION: the class writes exactly one storage key, and it is not
   * the mute one. That stays true and stays meaningful whichever way the next
   * round settles volume (a control, or a deletion).
   *
   * MUTATION: re-add `window.localStorage.setItem(MUTED_KEY, …)` to `persist()`
   * — two writers, red. COMMENTING that line out instead leaves one writer and
   * stays green, which is correct: commented-out is the state being asked for.
   */
  it("leaves the mute key to the store — one writer, and it is the volume one", () => {
    const writes = LIVE.match(/localStorage\.setItem\([^)]*\)/g) ?? [];
    expect(writes).toHaveLength(1);
    expect(writes[0]).toContain("VOLUME_KEY");
    expect(LIVE).not.toContain("MUTED_KEY");
    expect(LIVE).not.toContain("knijka.sim.muted");
  });

  /**
   * A listener that outlives the graph would call `applyMaster` on a disposed
   * instance once per lesson ever mounted, every time a student touches the row.
   *
   * MUTATION: delete the `this.unsubscribeMute?.()` line from `dispose()`. Red.
   */
  it("drops its subscription on dispose", () => {
    expect(LIVE).toContain("subscribeSimAudioMuted(() => this.applyMaster())");
    expect(LIVE).toContain("this.unsubscribeMute?.()");
  });
});
