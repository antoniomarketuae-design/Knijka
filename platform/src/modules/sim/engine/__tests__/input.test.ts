/**
 * SimInput — analog keyboard pedal ramps (QW8, plan doc 68 / audit A9).
 *
 * Keys are binary; the ramp turns hold-time into progressive pedal input so
 * "smooth stop" is the student's timing skill. Runs in the node environment:
 * window is stubbed, the monotonic clock is injected via the constructor.
 */

import { afterEach, describe, expect, it, vi } from "vitest";
import {
  BRAKE_ATTACK_S,
  BRAKE_RELEASE_S,
  MAX_RAMP_DT_S,
  SimInput,
  stepPedal,
  THROTTLE_ATTACK_S,
  THROTTLE_RELEASE_S,
} from "../input";

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

/** SimInput + fake clock harness. `advance` steps wall time in small frames,
 * calling read() each frame (like the render/physics loops do). */
function harness() {
  const win = stubWindow();
  let tMs = 0;
  const input = new SimInput({}, () => tMs);
  input.read(); // prime the clock (first read has dt=0)

  return {
    input,
    press: (code: string) => win.fire("keydown", keyEvent(code)),
    release: (code: string) => win.fire("keyup", keyEvent(code)),
    blur: () => win.fire("blur", {}),
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
    /** One single read after a `ms` gap (no intermediate frames). */
    jump(ms: number) {
      tMs += ms;
      return input.read();
    },
  };
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("stepPedal (pure ramp)", () => {
  it("ramps up linearly while held and saturates at 1", () => {
    expect(stepPedal(0, true, 0.35 / 2, 0.35, 0.25)).toBeCloseTo(0.5, 5);
    expect(stepPedal(0, true, 0.35, 0.35, 0.25)).toBe(1);
    expect(stepPedal(0.9, true, 1, 0.35, 0.25)).toBe(1); // clamped
  });

  it("ramps down linearly when released and clamps at 0", () => {
    expect(stepPedal(1, false, 0.25 / 2, 0.35, 0.25)).toBeCloseTo(0.5, 5);
    expect(stepPedal(1, false, 0.25, 0.35, 0.25)).toBe(0);
    expect(stepPedal(0.1, false, 1, 0.35, 0.25)).toBe(0); // clamped
  });
});

describe("SimInput keyboard pedal ramps", () => {
  it("throttle ramps progressively to full over the attack time", () => {
    const h = harness();
    h.press("KeyW");
    const mid = h.advance(THROTTLE_ATTACK_S * 500); // half the attack, in ms
    expect(mid.throttle).toBeGreaterThan(0.4);
    expect(mid.throttle).toBeLessThan(0.6);
    const full = h.advance(THROTTLE_ATTACK_S * 600);
    expect(full.throttle).toBe(1);
    h.input.dispose();
  });

  it("throttle releases back to zero over the release time", () => {
    const h = harness();
    h.press("KeyW");
    h.advance(1000); // saturate
    h.release("KeyW");
    const mid = h.advance(THROTTLE_RELEASE_S * 500);
    expect(mid.throttle).toBeGreaterThan(0.4);
    expect(mid.throttle).toBeLessThan(0.6);
    const off = h.advance(THROTTLE_RELEASE_S * 600);
    expect(off.throttle).toBe(0);
    h.input.dispose();
  });

  it("brake uses its own (quicker) attack/release constants", () => {
    const h = harness();
    h.press("KeyS");
    const mid = h.advance(BRAKE_ATTACK_S * 500);
    expect(mid.brake).toBeGreaterThan(0.4);
    expect(mid.brake).toBeLessThan(0.6);
    expect(h.advance(BRAKE_ATTACK_S * 600).brake).toBe(1);
    h.release("KeyS");
    expect(h.advance(BRAKE_RELEASE_S * 1100).brake).toBe(0);
    h.input.dispose();
  });

  it("feathering (short tap) produces genuine partial pedal input", () => {
    const h = harness();
    h.press("KeyW");
    const tapped = h.advance(140); // 0.14 s of a 0.35 s attack → 0.4
    expect(tapped.throttle).toBeCloseTo(0.14 / THROTTLE_ATTACK_S, 2);
    h.release("KeyW");
    const decaying = h.advance(50); // partway down the release ramp
    expect(decaying.throttle).toBeGreaterThan(0.1);
    expect(decaying.throttle).toBeLessThan(0.14 / THROTTLE_ATTACK_S);
    h.input.dispose();
  });

  it("clamps a stalled-tab gap so one read cannot slam the pedal", () => {
    const h = harness();
    h.press("KeyW");
    const out = h.jump(5000); // 5 s gap, single read
    expect(out.throttle).toBeCloseTo(MAX_RAMP_DT_S / THROTTLE_ATTACK_S, 5);
    h.input.dispose();
  });

  it("keeps steering binary (ramps apply to pedals only)", () => {
    const h = harness();
    h.press("KeyA");
    expect(h.advance(0).steer).toBe(1);
    h.release("KeyA");
    expect(h.advance(0).steer).toBe(0);
    h.input.dispose();
  });

  it("window blur releases the pedals (ramp down, no stuck throttle)", () => {
    const h = harness();
    h.press("KeyW");
    h.advance(1000);
    h.blur();
    expect(h.advance(THROTTLE_RELEASE_S * 1100).throttle).toBe(0);
    h.input.dispose();
  });
});
