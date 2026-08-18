/**
 * SWEEP 161 · THE RESULT SCREEN OPENED 64 px DOWN ITS OWN FIRST CONTROL.
 *
 * MEASURED · four frames, all mobile, all with the same slice:
 * sc-rb-exit-signal, sc-crossing-dart, sc-signal-flashing and
 * sc-ed-poligon-chain — `08-debrief.png` at 852 × 393 CSS px. Rows y≈0–25 of
 * the result screen are the BOTTOM HALVES of „Докосни „▾ Скрий разбора“, за да
 * пропуснеш разбора" and of the „Не показвай автоматично" pill beside it. The
 * 44 px control those two belong to is entirely above the top edge. The first
 * thing the student meets after a lesson is a sliced sentence and half a tap
 * target.
 *
 * THE CAUSE IS NOT ON THIS SCREEN, IT IS THE SCREEN BEFORE IT. Three facts,
 * one mechanism:
 *
 *   1. every one of the four has «Сесията завърши — първо се самооцени» on its
 *      `07-end.png` — the I1 gate (`calibrationLocked`) was the surface
 *      immediately before the result, and the thumb had to scroll it to reach
 *      «Пропусни» at the bottom of the gate card;
 *   2. the gate and the result are the SAME mounted subtree.
 *      `calibrationLocked` only changes what SessionEndScreen RETURNS — both
 *      branches return a `<div>` in the same position, so React reconciles them
 *      onto one DOM node and its `scrollTop` outlives the swap, applied now to
 *      a document five times as long;
 *   3. the PC leg of the same sweep shows no offset at all — at 900 px the gate
 *      fits and nothing ever had to scroll.
 *
 * WHICH BOX HOLDS THE OFFSET, AND WHY THE FIRST FIX COULD NOT CLEAR IT. The
 * first pass reached only for `scrollIntoView`, which is specified to move
 * every scrollable ANCESTOR and never the element's own `scrollTop` — and this
 * screen's root is itself a scroll container (`max-h-full … overflow-y-auto`),
 * the innermost one a thumb can grab. So the one box guaranteed to be carrying
 * the offset was the one box that call could not touch. `releaseGateScroll`
 * zeroes it AND asks the ancestors, in that order.
 *
 * WHY SOME OF THIS FILE READS SOURCE. The whole suite is `environment: "node"`
 * (vitest.config.ts) and no DOM package is installed, so a mounted ref cannot
 * be driven here. What CAN be driven is driven — the two helpers below are pure
 * and are called for real, with a stand-in element that records what was done
 * to it. Only the two facts with no pure form left (the ref is attached to the
 * root; the root gives the scrim's padding back) are read off the file.
 *
 * MUTATION, run before this file was committed:
 *   · delete `el.scrollTop = 0`      → „zeroes the element's own scrollTop" red
 *   · delete the `scrollIntoView`    → „…and then asks every ancestor" red
 *   · `return wasLocked` in gateReleased → „never on a plain re-render" red
 *   · `return !isLocked`             → „fires on the release edge" stays green,
 *                                      „never on a plain re-render" goes red
 */

import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { gateReleased, releaseGateScroll } from "../SessionEndScreen";

const SRC = resolve(__dirname, "..");
const END_SCREEN = readFileSync(resolve(SRC, "SessionEndScreen.tsx"), "utf8");

/** Comments in this file quote the BEFORE state; assertions must read code. */
function code(src: string): string {
  return src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^[ \t]*\/\/.*$/gm, "");
}
const END_SCREEN_CODE = code(END_SCREEN);

/** A stand-in for the root element: records both halves of the reset. */
function fakeRoot(scrollTop: number) {
  const calls: ScrollIntoViewOptions[] = [];
  return {
    scrollTop,
    scrollIntoView(opts: ScrollIntoViewOptions) {
      calls.push(opts);
    },
    calls,
  };
}

describe("the I1 gate's scroll offset does not survive into the result", () => {
  it("FAILS ON THE SHIPPED BUILD: it zeroes the element's own scrollTop", () => {
    // 64 px is the measured offset off sc-rb-exit-signal/mobile-right — the
    // 44 px control, the 4 px gap and the scrim's p-4.
    const root = fakeRoot(64);
    releaseGateScroll(root);
    expect(root.scrollTop).toBe(0);
  });

  it("…and then asks every ancestor, which is the half scrollIntoView owns", () => {
    // On our OWN root, so the browser picks whichever ancestor scrolls: this
    // component must not know that the shell's scrim is the scroll port today.
    const root = fakeRoot(64);
    releaseGateScroll(root);
    expect(root.calls).toEqual([{ block: "start" }]);
  });

  it("does nothing at all — and does not throw — before the ref is attached", () => {
    expect(() => releaseGateScroll(null)).not.toThrow();
  });

  it("THE OTHER DIRECTION: it fires on the RELEASE, never on every render", () => {
    // A reset with no edge test would yank a student back to the top every time
    // the shell's 150 ms HUD poll re-rendered this screen — i.e. it would make
    // the debrief unreadable while claiming to fix reading it.
    expect(gateReleased(true, false)).toBe(true);
    // Still held; nothing to put at the top yet.
    expect(gateReleased(true, true)).toBe(false);
    // A plain re-render of the released result — the 150 ms poll case.
    expect(gateReleased(false, false)).toBe(false);
    // The gate CLOSING over a result (a retry re-arming it) is not a release.
    expect(gateReleased(false, true)).toBe(false);
  });

  it("the effect is wired to that edge and advances the ref every run", () => {
    const effect = END_SCREEN_CODE.match(
      /const released = gateReleased\([^;]+;[\s\S]{0,240}?releaseGateScroll\([^)]*\);/,
    );
    expect(effect).not.toBeNull();
    const body = effect?.[0] ?? "";
    expect(body).toMatch(/gateReleased\(wasCalibrationLocked\.current, calibrationLocked\)/);
    expect(body).toMatch(/if \(released\)/);
    // …or the edge fires forever.
    expect(body).toMatch(/wasCalibrationLocked\.current = calibrationLocked/);
  });

  it("the effect re-runs only when the lock changes", () => {
    expect(END_SCREEN_CODE).toMatch(/releaseGateScroll\([\s\S]{0,80}?\}, \[calibrationLocked\]\)/);
  });

  it("the reset is aimed at the root, and the root gives the scrim's p-4 back", () => {
    expect(END_SCREEN_CODE).toMatch(/ref=\{resultRef\}/);
    expect(END_SCREEN_CODE).toMatch(/releaseGateScroll\(resultRef\.current\)/);
    expect(END_SCREEN_CODE).toContain("scroll-mt-4");
  });
});
