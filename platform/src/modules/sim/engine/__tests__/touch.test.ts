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
  applyReversePedalRemap,
  ReverseAssist,
  ReversePedalMapper,
  shouldRemapReversePedals,
  type ReverseAssistCommand,
} from "../reverseAssist";
import {
  driveAxisFromDrag,
  pedalFromPointerY,
  steerFromDrag,
  TOUCH_DRIVE_DEADZONE_PX,
  TOUCH_DRIVE_RANGE_PX,
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

describe("driveAxisFromDrag (pure) — the ONE drivetrain slider", () => {
  const R = TOUCH_DRIVE_RANGE_PX;
  const D = TOUCH_DRIVE_DEADZONE_PX;

  it("centres at zero and holds zero across the whole dead zone", () => {
    expect(driveAxisFromDrag(0, R)).toBe(0);
    expect(driveAxisFromDrag(D, R)).toBe(0);
    expect(driveAxisFromDrag(-D, R)).toBe(0);
  });

  it("up is forward (positive = throttle), down is backwards (negative = brake)", () => {
    expect(driveAxisFromDrag(-R, R)).toBe(1);
    expect(driveAxisFromDrag(R, R)).toBe(-1);
  });

  it("clamps past the range instead of overshooting", () => {
    expect(driveAxisFromDrag(-500, R)).toBe(1);
    expect(driveAxisFromDrag(500, R)).toBe(-1);
  });

  it("re-normalizes past the dead zone so full travel still reaches full pedal", () => {
    // Without re-normalization the dead zone would eat the top of the range.
    expect(driveAxisFromDrag(-R, R, D)).toBe(1);
    expect(driveAxisFromDrag(-R, R, 0)).toBe(1);
  });

  it("expo softens the middle: half the usable throw gives LESS than half pedal", () => {
    const half = driveAxisFromDrag(-(D + (R - D) / 2), R, D);
    expect(half).toBeCloseTo(Math.pow(0.5, TOUCH_STEER_EXPO), 5);
    expect(half).toBeGreaterThan(0);
    expect(half).toBeLessThan(0.5);
  });

  it("is symmetric about centre and safe on a degenerate range", () => {
    expect(driveAxisFromDrag(40, R)).toBeCloseTo(-driveAxisFromDrag(-40, R), 10);
    expect(driveAxisFromDrag(40, 0)).toBe(0);
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

describe("ONE THUMB, ONE AXIS, AND REVERSE — the founder's sentence, end to end", () => {
  // „there can be only 1 slider — up is forward middle is stop down is
  // backwards … very hard to switch to reverse".
  //
  // The overlay itself is a DOM component and cannot run in this node harness,
  // so this walks the exact chain it walks: a vertical drag on the drivetrain
  // pad → driveAxisFromDrag → TouchInputSource → SimInput.read() → the raw
  // pedals the scene feeds ReverseAssist → the pedal remap that makes "down"
  // keep meaning backwards once the selector is in R. No gear control is
  // touched anywhere in it — that is the whole point.
  const RANGE = TOUCH_DRIVE_RANGE_PX;

  /** What TouchControls' driveApply does, in one place. */
  function thumb(src: TouchInputSource, dyPx: number) {
    const axis = driveAxisFromDrag(dyPx, RANGE);
    if (axis > 0) {
      src.releaseBrake();
      src.setThrottle(axis);
    } else if (axis < 0) {
      src.releaseThrottle();
      src.setBrake(-axis);
    } else {
      src.releaseThrottle();
      src.releaseBrake();
    }
  }

  /** Step the assist for `sec` on the pedals the thumb is currently making,
   *  the way the scene does — one frame at 60 Hz, RAW pedals. */
  function driveAssist(
    assist: ReverseAssist,
    input: SimInput,
    sec: number,
    speedKmh: number,
    selector: "D" | "R" = "D",
  ): ReverseAssistCommand | null {
    let command: ReverseAssistCommand | null = null;
    for (let t = 0; t < sec; t += 1 / 60) {
      const pedals = input.read();
      command =
        assist.update({
          speedKmh,
          selector,
          brakePedal: pedals.brake,
          throttlePedal: pedals.throttle,
          dtSec: 1 / 60,
        }) ?? command;
    }
    return command;
  }

  it("a thumb held down THROUGH the stop keeps the car in D — that is a stop, not a request to reverse", () => {
    // The defect this file's second half now guards: on touch the natural way
    // to stop is to plant the thumb at the bottom and leave it there, which is
    // exactly how a Б2 stop looked to the old hold-based trigger.
    const h = harness();
    const src = new TouchInputSource();
    h.input.attachTouch(src);
    const assist = new ReverseAssist();

    thumb(src, RANGE); // full down = full brake, planted while still rolling
    expect(driveAssist(assist, h.input, 0.6, 9)).toBe(null); // braking to a halt
    expect(driveAssist(assist, h.input, 30, 0)).toBe(null); // …then 30 s stopped
    h.input.dispose();
  });

  it("thumb to centre, then DOWN again at a standstill puts the car in R, with no gear input", () => {
    const h = harness();
    const src = new TouchInputSource();
    h.input.attachTouch(src);
    const assist = new ReverseAssist();

    thumb(src, 0); // spring-centred: the thumb comes off the pedal
    expect(driveAssist(assist, h.input, 0.4, 0)).toBe(null);

    thumb(src, RANGE); // full down = full brake
    const held = h.input.read();
    expect(held.brake).toBe(1);
    expect(held.throttle).toBe(0);

    expect(driveAssist(assist, h.input, 0.5, 0)).toBe("shiftToR");
    h.input.dispose();
  });

  it("once in R the remap makes DOWN accelerate backwards and UP brake", () => {
    const src = new TouchInputSource();

    thumb(src, RANGE); // thumb down
    const down = baseInput();
    src.mergeInto(down);
    expect(shouldRemapReversePedals("R", "automatic")).toBe(true);
    applyReversePedalRemap(down);
    expect(down.throttle).toBe(1); // …is now the REVERSE accelerator
    expect(down.brake).toBe(0);

    thumb(src, -RANGE); // thumb up
    const up = baseInput();
    src.mergeInto(up);
    applyReversePedalRemap(up);
    expect(up.brake).toBe(1); // …is now the brake
    expect(up.throttle).toBe(0);
  });

  it("…but a thumb that was ALREADY down when R engaged goes on braking", () => {
    // Same chain, through the mapper the scene actually uses (LAW 2). The
    // thumb never moved; only the selector did. A pedal that meant stop must
    // not become the reverse accelerator under a stationary thumb.
    const src = new TouchInputSource();
    const mapper = new ReversePedalMapper();

    thumb(src, RANGE); // thumb planted at the bottom = full brake, in D
    const inD = baseInput();
    src.mergeInto(inD);
    mapper.apply(inD, false);
    expect(inD.brake).toBe(1);

    const inR = baseInput(); // …selector goes to R, thumb unmoved
    src.mergeInto(inR);
    mapper.apply(inR, true);
    expect(inR.throttle).toBe(0);
    expect(inR.brake).toBe(1);

    thumb(src, 0); // thumb lifts to centre
    const centre = baseInput();
    src.mergeInto(centre);
    mapper.apply(centre, true);

    thumb(src, RANGE); // and presses again — NOW it reverses
    const again = baseInput();
    src.mergeInto(again);
    mapper.apply(again, true);
    expect(again.throttle).toBe(1);
    expect(again.brake).toBe(0);
  });

  it("letting go returns to neutral — a spring-centred axis holds nothing", () => {
    const src = new TouchInputSource();
    thumb(src, RANGE);
    src.releaseThrottle();
    src.releaseBrake();
    const out = baseInput();
    src.mergeInto(out);
    expect(out).toEqual(baseInput());
  });

  it("the axis can never hold both pedals — which is what lets the assist see the hold", () => {
    const src = new TouchInputSource();
    for (const dy of [-RANGE, -20, -7, 0, 7, 20, RANGE]) {
      thumb(src, dy);
      const out = baseInput();
      src.mergeInto(out);
      expect(Math.min(out.throttle, out.brake)).toBe(0);
    }
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
