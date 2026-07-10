/**
 * P1 touch input — pure mapping curves + the priority merge into SimInput.
 *
 * The DOM overlay (TouchControls.tsx) is not testable in this node harness
 * (vitest env "node", *.test.ts only); everything below it — drag→steer,
 * strip→pedal, "touch active → touch wins" — is pure and covered here.
 */

import { afterEach, describe, expect, it, vi } from "vitest";
import { SimInput } from "../input";
import {
  pedalFromPointerY,
  steerFromDrag,
  TOUCH_STEER_EXPO,
  TouchInputSource,
} from "../touch";
import type { VehicleInput } from "../../vehicle";

type Handler = (e: unknown) => void;

function stubWindow() {
  const handlers = new Map<string, Handler[]>();
  vi.stubGlobal("window", {
    addEventListener: (type: string, fn: Handler) => {
      handlers.set(type, [...(handlers.get(type) ?? []), fn]);
    },
    removeEventListener: (type: string, fn: Handler) => {
      handlers.set(
        type,
        (handlers.get(type) ?? []).filter((h) => h !== fn),
      );
    },
  });
  return {
    fire(type: string, e: unknown) {
      for (const h of handlers.get(type) ?? []) h(e);
    },
  };
}

function keyEvent(code: string) {
  return { code, repeat: false, preventDefault: () => {} };
}

/** SimInput + fake clock harness (same pattern as input.test.ts). */
function harness() {
  const win = stubWindow();
  let tMs = 0;
  const input = new SimInput({}, () => tMs);
  input.read(); // prime the clock (first read has dt=0)
  return {
    input,
    press: (code: string) => win.fire("keydown", keyEvent(code)),
    /** Advance wall time by `ms` in 10 ms frames; returns the last read. */
    advance(ms: number) {
      let out = input.read();
      let remaining = ms;
      while (remaining > 0) {
        const step = Math.min(10, remaining);
        tMs += step;
        remaining -= step;
        out = input.read();
      }
      return out;
    },
  };
}

afterEach(() => {
  vi.unstubAllGlobals();
});

function baseInput(over: Partial<VehicleInput> = {}): VehicleInput {
  return { throttle: 0, brake: 0, steer: 0, handbrake: false, ...over };
}

describe("steerFromDrag (pure)", () => {
  it("is centred at zero and reaches full lock at the range edge", () => {
    expect(steerFromDrag(0, 200)).toBe(0);
    expect(steerFromDrag(200, 200)).toBe(-1); // drag right = steer RIGHT (negative)
    expect(steerFromDrag(-200, 200)).toBe(1); // drag left = steer LEFT (positive)
  });

  it("clamps beyond the range instead of overshooting", () => {
    expect(steerFromDrag(1000, 200)).toBe(-1);
    expect(steerFromDrag(-1000, 200)).toBe(1);
  });

  it("expo softens the centre: half drag gives LESS than half lock", () => {
    const half = steerFromDrag(-100, 200); // drag left → positive steer
    expect(half).toBeCloseTo(Math.pow(0.5, TOUCH_STEER_EXPO), 5);
    expect(half).toBeGreaterThan(0);
    expect(half).toBeLessThan(0.5);
  });

  it("is symmetric and returns 0 for a degenerate zone", () => {
    expect(steerFromDrag(80, 200)).toBeCloseTo(-steerFromDrag(-80, 200), 10);
    expect(steerFromDrag(50, 0)).toBe(0);
  });
});

describe("pedalFromPointerY (pure)", () => {
  // Strip: top at y=100, height 200 → bottom edge at y=300.
  it("maps strip bottom → 0, top → 1, middle → 0.5", () => {
    expect(pedalFromPointerY(300, 100, 200)).toBe(0);
    expect(pedalFromPointerY(100, 100, 200)).toBe(1);
    expect(pedalFromPointerY(200, 100, 200)).toBeCloseTo(0.5, 5);
  });

  it("clamps outside the strip (drag past either end)", () => {
    expect(pedalFromPointerY(50, 100, 200)).toBe(1); // above the top
    expect(pedalFromPointerY(400, 100, 200)).toBe(0); // below the bottom
    expect(pedalFromPointerY(150, 100, 0)).toBe(0); // degenerate zone
  });
});

describe("TouchInputSource priority merge", () => {
  it("leaves every axis untouched while inactive", () => {
    const src = new TouchInputSource();
    const out = baseInput({ throttle: 0.8, brake: 0.3, steer: -0.5 });
    src.mergeInto(out);
    expect(out).toEqual(baseInput({ throttle: 0.8, brake: 0.3, steer: -0.5 }));
  });

  it("an active touch axis REPLACES a stronger keyboard value (priority, not max)", () => {
    const src = new TouchInputSource();
    src.setThrottle(0.25);
    const out = baseInput({ throttle: 1 }); // keyboard W fully ramped
    src.mergeInto(out);
    expect(out.throttle).toBe(0.25);
  });

  it("merges each axis independently", () => {
    const src = new TouchInputSource();
    src.setSteer(-0.4);
    const out = baseInput({ steer: 1, throttle: 0.7 });
    src.mergeInto(out);
    expect(out.steer).toBe(-0.4); // touch owns steer
    expect(out.throttle).toBe(0.7); // keyboard keeps throttle
  });

  it("release returns the axis to the other devices", () => {
    const src = new TouchInputSource();
    src.setBrake(0.6);
    src.releaseBrake();
    const out = baseInput({ brake: 0.9 });
    src.mergeInto(out);
    expect(out.brake).toBe(0.9);
  });

  it("clamps set values into the legal axis ranges", () => {
    const src = new TouchInputSource();
    src.setSteer(4);
    src.setThrottle(2);
    src.setBrake(-1);
    const out = baseInput();
    src.mergeInto(out);
    expect(out.steer).toBe(1);
    expect(out.throttle).toBe(1);
    expect(out.brake).toBe(0); // active but clamped to 0
  });

  it("releaseAll clears every held axis (pause/overlay-hide safety)", () => {
    const src = new TouchInputSource();
    src.setSteer(0.5);
    src.setThrottle(0.5);
    src.setBrake(0.5);
    src.releaseAll();
    const out = baseInput({ throttle: 0.1, brake: 0.2, steer: 0.3 });
    src.mergeInto(out);
    expect(out).toEqual(baseInput({ throttle: 0.1, brake: 0.2, steer: 0.3 }));
  });
});

describe("SimInput.attachTouch integration", () => {
  it("touch throttle overrides a fully ramped keyboard pedal, and release restores it", () => {
    const h = harness();
    const src = new TouchInputSource();
    h.input.attachTouch(src);

    h.press("KeyW");
    h.advance(1000); // saturate the QW8 ramp → keyboard throttle = 1
    src.setThrottle(0.3);
    expect(h.input.read().throttle).toBe(0.3); // touch wins while active

    src.releaseThrottle();
    expect(h.input.read().throttle).toBe(1); // keyboard ramp still held
    h.input.dispose();
  });

  it("touch steer overrides binary keyboard steer per axis", () => {
    const h = harness();
    const src = new TouchInputSource();
    h.input.attachTouch(src);

    h.press("KeyA"); // keyboard steer = +1 (left)
    src.setSteer(-0.35); // finger says: gently right
    const out = h.advance(0);
    expect(out.steer).toBe(-0.35);

    src.releaseSteer();
    expect(h.input.read().steer).toBe(1);
    h.input.dispose();
  });

  it("detaching (attachTouch(null)) removes touch from the pipeline", () => {
    const h = harness();
    const src = new TouchInputSource();
    h.input.attachTouch(src);
    src.setThrottle(0.5);
    expect(h.input.read().throttle).toBe(0.5);

    h.input.attachTouch(null);
    expect(h.input.read().throttle).toBe(0);
    h.input.dispose();
  });
});
