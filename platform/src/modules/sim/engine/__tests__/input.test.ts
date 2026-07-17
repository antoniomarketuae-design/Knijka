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
  KEY_LOG_SIZE,
  MAX_RAMP_DT_S,
  SimInput,
  stepPedal,
  THROTTLE_ATTACK_S,
  THROTTLE_RELEASE_S,
} from "../input";

type Handler = (e: unknown) => void;

function stubWindow(opts: { search?: string } = {}) {
  const handlers = new Map<string, Handler[]>();
  vi.stubGlobal("window", {
    // The ?debugkeys=1 detector reads window.location.search (absent by
    // default — the detector fails closed, like the real headless paths).
    ...(opts.search !== undefined ? { location: { search: opts.search } } : {}),
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

function keyEvent(code: string, key = "") {
  return { code, key, repeat: false, preventDefault: () => {} };
}

/** SimInput + fake clock harness. `advance` steps wall time in small frames,
 * calling read() each frame (like the render/physics loops do). */
function harness(winOpts: { search?: string } = {}) {
  const win = stubWindow(winOpts);
  let tMs = 0;
  const input = new SimInput({}, () => tMs);
  input.read(); // prime the clock (first read has dt=0)

  return {
    input,
    fire: win.fire,
    press: (code: string, key = "") => win.fire("keydown", keyEvent(code, key)),
    release: (code: string, key = "") => win.fire("keyup", keyEvent(code, key)),
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

  it("Space is NOT the momentary handbrake anymore (A1: parking-brake toggle lives in cabin.ts)", () => {
    const h = harness();
    h.press("Space");
    expect(h.advance(100).handbrake).toBe(false);
    h.input.dispose();
  });
});

// ---------------------------------------------------------------------------
// e.key fallback channel (founder bug 2026-07-17: "WASD dead, arrows work" —
// remote-desktop translate mode / Bulgarian layout stacks mangle e.code)
// ---------------------------------------------------------------------------

describe("SimInput e.key fallback channel", () => {
  it("Latin 'w' with a mangled e.code still ramps the throttle", () => {
    const h = harness();
    h.press("Unidentified", "w");
    expect(h.advance(THROTTLE_ATTACK_S * 1100).throttle).toBe(1);
    h.release("Unidentified", "w");
    expect(h.advance(THROTTLE_RELEASE_S * 1100).throttle).toBe(0);
    h.input.dispose();
  });

  it("Bulgarian phonetic 'в' (on the W key) drives the throttle", () => {
    const h = harness();
    h.press("Unidentified", "в");
    expect(h.advance(THROTTLE_ATTACK_S * 1100).throttle).toBe(1);
    h.release("Unidentified", "в");
    expect(h.advance(THROTTLE_RELEASE_S * 1100).throttle).toBe(0);
    h.input.dispose();
  });

  it("matches case-insensitively (Shift held → 'Д' still steers right)", () => {
    const h = harness();
    h.press("", "Д");
    expect(h.advance(0).steer).toBe(-1);
    h.release("", "д"); // Shift released before the key — cases differ
    expect(h.advance(0).steer).toBe(0);
    h.input.dispose();
  });

  it("'с' brakes and 'а' steers left (the full в/а/с/д set)", () => {
    const h = harness();
    h.press("", "с");
    h.press("", "а");
    const out = h.advance(BRAKE_ATTACK_S * 1100);
    expect(out.brake).toBe(1);
    expect(out.steer).toBe(1);
    h.input.dispose();
  });

  it("arrow keys match by e.key when e.code is missing too", () => {
    const h = harness();
    h.press("Unidentified", "ArrowDown");
    expect(h.advance(BRAKE_ATTACK_S * 1100).brake).toBe(1);
    h.release("Unidentified", "ArrowDown");
    expect(h.advance(BRAKE_RELEASE_S * 1100).brake).toBe(0);
    h.input.dispose();
  });

  it("the physical e.code channel still works when e.key is a layout character", () => {
    // BDS-style layout: physical W reports a valid code but a non-mapped key.
    const h = harness();
    h.press("KeyW", "ц");
    expect(h.advance(THROTTLE_ATTACK_S * 1100).throttle).toBe(1);
    h.release("KeyW", "ц");
    expect(h.advance(THROTTLE_RELEASE_S * 1100).throttle).toBe(0);
    h.input.dispose();
  });

  it("blur clears the fallback channel (no stuck reverse-key)", () => {
    const h = harness();
    h.press("Unidentified", "в");
    h.advance(1000);
    h.blur();
    expect(h.advance(THROTTLE_RELEASE_S * 1100).throttle).toBe(0);
    h.input.dispose();
  });

  it("preventDefaults fallback matches (ArrowDown with Unidentified code must not scroll)", () => {
    const h = harness();
    const prevented = vi.fn();
    h.fire("keydown", { code: "Unidentified", key: "ArrowDown", repeat: false, preventDefault: prevented });
    expect(prevented).toHaveBeenCalledTimes(1);
    const notPrevented = vi.fn();
    h.fire("keydown", { code: "Unidentified", key: "x", repeat: false, preventDefault: notPrevented });
    expect(notPrevented).not.toHaveBeenCalled();
    h.input.dispose();
  });
});

describe("SimInput ?debugkeys=1 diagnostic", () => {
  it("keeps the last KEY_LOG_SIZE keydown {code,key} pairs on window.__aidriveKeyLog", () => {
    vi.spyOn(console, "info").mockImplementation(() => {});
    const h = harness({ search: "?debugkeys=1" });
    for (let i = 0; i < KEY_LOG_SIZE + 2; i++) h.press("KeyW", "w");
    const log = (window as { __aidriveKeyLog?: Array<{ code: string; key: string }> })
      .__aidriveKeyLog;
    expect(log).toHaveLength(KEY_LOG_SIZE);
    expect(log![0]).toEqual({ code: "KeyW", key: "w" });
    h.input.dispose();
    vi.restoreAllMocks();
  });

  it("stays off without the URL flag (no window pollution)", () => {
    const h = harness(); // window without location — detector fails closed
    h.press("KeyW", "w");
    expect(
      (window as { __aidriveKeyLog?: unknown }).__aidriveKeyLog,
    ).toBeUndefined();
    h.input.dispose();
  });
});
