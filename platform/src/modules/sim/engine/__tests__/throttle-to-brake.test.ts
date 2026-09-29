/**
 * FROM LANE «input», wave 1 (landed by the integrator 2026-09-28). The lane
 * found sc-sig-controller-live:f3984089 to be a harness false positive, so its
 * brief forbade a platform/ change; it offered this test instead, because two
 * held-key mutants of input.ts SURVIVED input.test.ts, and both sit on the
 * exact transition that row was about: the throttle is lifted while the brake
 * key is held, at 2 fps, with no auto-repeat (Playwright's keyboard.down never
 * repeats).
 *
 *   M3  onKeyUp clears EVERY held key (lifting W drops a held S) — survived
 *   M8  the brake pedal only rises once W is up and the throttle pedal is 0 —
 *       survived
 *
 */

import { afterEach, describe, expect, it, vi } from "vitest";
import { PHYSICS_MAX_FRAME_DT } from "@/components/sim/lesson-ui/sessionClock";
import { SimInput } from "../input";

type Handler = (e: unknown) => void;

function harness() {
  const handlers = new Map<string, Handler[]>();
  vi.stubGlobal("window", {
    addEventListener: (type: string, fn: Handler) => handlers.set(type, [...(handlers.get(type) ?? []), fn]),
    removeEventListener: (type: string, fn: Handler) =>
      handlers.set(type, (handlers.get(type) ?? []).filter((h) => h !== fn)),
  });
  const fire = (type: string, e: unknown) => {
    for (const h of handlers.get(type) ?? []) h(e);
  };
  const key = (code: string) => ({ code, key: "", repeat: false, preventDefault: () => {} });
  let tMs = 0;
  const input = new SimInput({}, () => tMs);
  input.read();
  return {
    input,
    down: (code: string) => fire("keydown", key(code)),
    up: (code: string) => fire("keyup", key(code)),
    /** One slow frame: the whole gap lands on a single read, as at 2 fps. */
    frame(ms = PHYSICS_MAX_FRAME_DT * 1000) {
      tMs += ms;
      return { ...input.read() };
    },
  };
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("throttle lifted while the brake key is held — the keyboard hand-over at 2 fps", () => {
  it("the brake key pressed while W is still down is reported at full on the next slow frame", () => {
    // SimInput does not arbitrate between the pedals — VehicleSim does
    // (throttle priority in D). So the input layer must hand BOTH on, or the
    // brake is gone before physics ever decides. Kills M8.
    const h = harness();
    h.down("KeyW");
    h.frame();
    h.frame();
    h.down("KeyS");
    const both = h.frame();
    expect(both.throttle).toBe(1);
    expect(both.brake).toBe(1);
    h.input.dispose();
  });

  it("lifting W leaves a held S held — for ten slow frames with no auto-repeat", () => {
    // The harness order at a stop is keyup W, then keydown S; a human's is often
    // the overlap. Either way the brake must survive the throttle's keyup.
    // Kills M3 (a keyup that clears every key).
    const h = harness();
    h.down("KeyW");
    h.frame();
    h.down("KeyS");
    h.frame();
    h.up("KeyW");
    const first = h.frame();
    expect(first.throttle).toBe(0);
    expect(first.brake).toBe(1);
    for (let i = 0; i < 10; i++) {
      const f = h.frame();
      expect(f.brake).toBe(1);
      expect(f.throttle).toBe(0);
    }
    h.input.dispose();
  });
});
