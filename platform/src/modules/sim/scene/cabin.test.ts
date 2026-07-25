/**
 * GlanceHold — the pure hold-to-glance state machine behind Q/E/F and the
 * mirror hotspots (cabin.ts). Founder contract (2026-07-10): "when I press
 * any of the buttons they must HOLD the view" — key-down enters the glance,
 * the view persists WHILE HELD, key-up eases back. Grading latches once per
 * hold, on the press.
 *
 * CabinControls itself binds window listeners (not constructible headless),
 * so the envelope/hold logic lives in this extracted class.
 */

import { describe, expect, it } from "vitest";
import { GLANCE_EASE_S, GLANCE_REFRESH_S, GLANCE_TAP_HOLD_S, GlanceHold } from "./cabin";

/** Advance in render-ish frames (like CabinControls.update does). */
function tick(g: GlanceHold, seconds: number, step = 1 / 60): void {
  for (let t = 0; t < seconds; t += step) g.update(step);
}

/** Advance like tick() but collect the graded refresh latches update() emits. */
function tickCollect(g: GlanceHold, seconds: number, step = 1 / 60): Array<"left" | "right" | "rear"> {
  const out: Array<"left" | "right" | "rear"> = [];
  for (let t = 0; t < seconds; t += step) {
    const m = g.update(step);
    if (m) out.push(m);
  }
  return out;
}

describe("GlanceHold — founder contract: the view HOLDS while pressed", () => {
  it("press ramps in over GLANCE_EASE_S and then HOLDS at full deflection indefinitely", () => {
    const g = new GlanceHold();
    expect(g.start("left")).toBe(true);
    expect(g.mirror).toBe("left");

    tick(g, GLANCE_EASE_S / 2);
    expect(g.strength).toBeGreaterThan(0.3);
    expect(g.strength).toBeLessThan(1);

    tick(g, GLANCE_EASE_S);
    expect(g.strength).toBe(1);

    // The reported bug: the view "goes and comes back" on its own. Held for
    // 5 s it must STAY on the mirror.
    tick(g, 5);
    expect(g.strength).toBe(1);
    expect(g.mirror).toBe("left");
  });

  it("release eases back out and only then clears the mirror", () => {
    const g = new GlanceHold();
    g.start("rear");
    tick(g, 1);
    expect(g.strength).toBe(1);

    g.end("rear");
    tick(g, GLANCE_EASE_S / 2);
    // Mid-return: mirror still set (the camera needs it to ease back).
    expect(g.mirror).toBe("rear");
    expect(g.strength).toBeGreaterThan(0);
    expect(g.strength).toBeLessThan(1);

    tick(g, GLANCE_EASE_S);
    expect(g.strength).toBe(0);
    expect(g.mirror).toBeNull();
  });

  it("grades once per hold: the press latches, holding does not re-latch", () => {
    const g = new GlanceHold();
    expect(g.start("left")).toBe(true); // key down → graded
    // Second source on the SAME held mirror (hotspot press while Q is held).
    expect(g.start("left")).toBe(false); // same hold → no second grade
    g.end("left");
    tick(g, GLANCE_EASE_S * 2);
    expect(g.start("left")).toBe(true); // a NEW hold grades again
  });

  it("re-press during the ease-out is a new graded hold and swings back in", () => {
    const g = new GlanceHold();
    g.start("left");
    tick(g, 1);
    g.end("left");
    tick(g, GLANCE_EASE_S / 3); // partway back
    const mid = g.strength;
    expect(g.start("left")).toBe(true); // held=false → new hold, new grade
    tick(g, GLANCE_EASE_S);
    expect(g.strength).toBe(1);
    expect(mid).toBeLessThan(1);
  });

  it("releasing a DIFFERENT mirror's key never cancels the active hold", () => {
    const g = new GlanceHold();
    g.start("left"); // hold Q
    g.start("right"); // press E while Q held — latest press wins
    expect(g.mirror).toBe("right");
    g.end("left"); // Q up — must not release the E-hold
    tick(g, 1);
    expect(g.mirror).toBe("right");
    expect(g.strength).toBe(1);
    g.end("right");
    tick(g, GLANCE_EASE_S * 2);
    expect(g.mirror).toBeNull();
  });

  it("tap (touch buttons, no release edge) auto-releases after GLANCE_TAP_HOLD_S", () => {
    const g = new GlanceHold();
    expect(g.start("rear", true)).toBe(true);
    tick(g, GLANCE_TAP_HOLD_S / 2);
    expect(g.strength).toBe(1); // holding on its own
    tick(g, GLANCE_TAP_HOLD_S / 2 + GLANCE_EASE_S * 2);
    expect(g.mirror).toBeNull(); // released + eased out by itself
  });

  it("release() (window blur) never leaves the view stuck on a mirror", () => {
    const g = new GlanceHold();
    g.start("left");
    tick(g, 1);
    g.release();
    tick(g, GLANCE_EASE_S * 2);
    expect(g.mirror).toBeNull();
    expect(g.strength).toBe(0);
  });
});

describe("GlanceHold — held-glance refresh (founder R3 #13: the look stays fresh)", () => {
  it("an ongoing hold re-latches the graded sample every GLANCE_REFRESH_S", () => {
    // The founder's live failure at the second Б1 mouth: he HELD the look
    // button while waiting for the priority car — the press latched once, the
    // 5 s lookback expired mid-hold, and the crossing graded „no scan" while
    // his head was literally on the mirror. The refresh stream is the fix.
    const g = new GlanceHold();
    expect(g.start("left")).toBe(true); // the press latch (once)
    const refreshes = tickCollect(g, GLANCE_REFRESH_S * 3.5);
    expect(refreshes.length).toBeGreaterThanOrEqual(3);
    expect(refreshes.every((m) => m === "left")).toBe(true);
  });

  it("mashing the same touch button keeps the refresh stream alive without re-latching", () => {
    // Touch taps auto-release after GLANCE_TAP_HOLD_S; re-taps inside the hold
    // return false (no second press latch) but re-arm the hold — so a masher
    // at the mouth stays continuously fresh through the refresh stream.
    const g = new GlanceHold();
    expect(g.start("right", true)).toBe(true);
    const collected: string[] = [];
    for (let k = 0; k < 6; k++) {
      collected.push(...tickCollect(g, GLANCE_TAP_HOLD_S / 2));
      expect(g.start("right", true)).toBe(false); // re-tap mid-hold: no re-latch
    }
    expect(collected.length).toBeGreaterThanOrEqual(2);
    expect(collected.every((m) => m === "right")).toBe(true);
  });

  it("no refresh once released — the ease-out is not a look", () => {
    const g = new GlanceHold();
    g.start("rear");
    tickCollect(g, GLANCE_REFRESH_S * 1.5); // consume any held refreshes
    g.end("rear");
    expect(tickCollect(g, GLANCE_REFRESH_S * 2)).toEqual([]);
  });

  it("a new hold restarts the refresh clock at the press", () => {
    const g = new GlanceHold();
    g.start("left");
    tickCollect(g, GLANCE_REFRESH_S * 0.8);
    g.end("left");
    tick(g, GLANCE_EASE_S * 2);
    g.start("left"); // new hold — fresh press latch, fresh clock
    expect(tickCollect(g, GLANCE_REFRESH_S * 0.9)).toEqual([]); // not yet due
    expect(tickCollect(g, GLANCE_REFRESH_S * 0.2)).toEqual(["left"]);
  });
});
