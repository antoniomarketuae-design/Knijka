/**
 * A MANUAL KEY HOLD MUST SURVIVE A SCRIPT STEP BOUNDARY.
 *
 * `DriveRigHandle.press()` is documented as „e.g. press('KeyE') for a held
 * right glance" — the one thing register row B29 needs a frame of. It did not
 * survive: `syncKeys()` runs on every step advance and called
 * `setHeld(step.keys ?? [])`, which fires `keyup` on every code not in the NEW
 * step's list. A glance pressed during „approach" was released the instant the
 * script handed over to „stand at the pose", and the twenty frames shot after
 * that came back with the head swung home — indistinguishable, in a PNG, from
 * „there is nothing there to see". The failure was silent: the pedals kept
 * working, the drive kept going, only the evidence was wrong.
 *
 * These tests pin the seam. They drive `setHeld` through its two real callers
 * (`run()` → `syncKeys()`, and `stop()`), which is where the keyup was fired,
 * and read the synthetic keyboard events back off a stubbed window.
 */
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { DriveRig } from "../rig";

interface FiredKey {
  type: string;
  code: string;
}

let fired: FiredKey[] = [];
let priorWindow: unknown;
let priorKeyboardEvent: unknown;
let priorGetGamepads: unknown;

const g = globalThis as unknown as Record<string, unknown>;
const nav = globalThis.navigator as unknown as Record<string, unknown>;

beforeEach(() => {
  fired = [];
  priorWindow = g.window;
  priorKeyboardEvent = g.KeyboardEvent;
  // `run()` installs the synthetic gamepad; node has a `navigator` but no
  // `getGamepads` on it, so give the pad something to save and restore.
  priorGetGamepads = nav.getGamepads;
  Object.defineProperty(nav, "getGamepads", {
    configurable: true,
    writable: true,
    value: () => [],
  });
  g.KeyboardEvent = class {
    readonly type: string;
    readonly code: string;
    constructor(type: string, init: { code: string }) {
      this.type = type;
      this.code = init.code;
    }
  };
  g.window = {
    dispatchEvent: (e: FiredKey) => {
      fired.push({ type: e.type, code: e.code });
      return true;
    },
  };
});

afterEach(() => {
  g.window = priorWindow;
  g.KeyboardEvent = priorKeyboardEvent;
  if (priorGetGamepads === undefined) delete nav.getGamepads;
  else
    Object.defineProperty(nav, "getGamepads", {
      configurable: true,
      writable: true,
      value: priorGetGamepads,
    });
});

const rig = () => new DriveRig({ lessonId: "sc-jx-giveway-b1", lessonTitleBg: "Б1" });
const codes = (type: string) => fired.filter((f) => f.type === type).map((f) => f.code);

describe("drive rig — manual key holds vs the script", () => {
  it("keeps a manually pressed glance held when a script starts (B29 regression)", () => {
    const r = rig();
    r.handle.press("KeyE");
    expect(codes("keydown")).toEqual(["KeyE"]);

    // `run()` calls syncKeys() — this is the exact call that used to release it.
    r.handle.run([{ label: "approach", speedKmh: 20 }]);

    expect(codes("keyup")).toEqual([]);
    expect(r.handle.status().heldKeys).toContain("KeyE");
  });

  it("keeps it held across a step whose own keys are different", () => {
    const r = rig();
    r.handle.press("KeyE");
    r.handle.run([{ label: "scan left", speedKmh: 20, keys: ["KeyQ"] }]);

    expect(codes("keydown")).toEqual(["KeyE", "KeyQ"]);
    expect(codes("keyup")).toEqual([]);
    expect(r.handle.status().heldKeys.sort()).toEqual(["KeyE", "KeyQ"]);
  });

  it("still releases the SCRIPT's keys when the script moves on", () => {
    const r = rig();
    r.handle.run([{ label: "scan left", speedKmh: 20, keys: ["KeyQ"] }]);
    expect(codes("keydown")).toEqual(["KeyQ"]);
    // Re-running replaces the script — the previous step's key must go.
    r.handle.run([{ label: "roll", speedKmh: 20 }]);
    expect(codes("keyup")).toEqual(["KeyQ"]);
    expect(r.handle.status().heldKeys).toEqual([]);
  });

  it("release() gives the key back, and a later script change does not resurrect it", () => {
    const r = rig();
    r.handle.press("KeyE");
    r.handle.release("KeyE");
    expect(codes("keyup")).toEqual(["KeyE"]);
    r.handle.run([{ label: "roll", speedKmh: 20 }]);
    expect(r.handle.status().heldKeys).toEqual([]);
  });

  it("stop() releases everything, manual holds included", () => {
    const r = rig();
    r.handle.press("KeyE");
    r.handle.run([{ label: "scan left", speedKmh: 20, keys: ["KeyQ"] }]);
    r.handle.stop();
    expect(codes("keyup").sort()).toEqual(["KeyE", "KeyQ"]);
    expect(r.handle.status().heldKeys).toEqual([]);
  });
});
