/**
 * SWEEP 161 · THE RESULT SCREEN OPENED 64 px DOWN ITS OWN FIRST CONTROL.
 *
 * MEASURED · sc-rb-exit-signal/mobile/right · 08-debrief.png, an
 * iphone16-landscape context at 852 × 393 CSS px: rows y≈0–25 of the result
 * screen are the BOTTOM HALVES of „Докосни „▾ Скрий разбора“, за да пропуснеш
 * разбора" and of the „Не показвай автоматично" pill beside it. The 44 px
 * control those two belong to is entirely above the top edge. The first thing
 * the student meets after a lesson is a sliced sentence and half a tap target.
 *
 * THE CAUSE IS NOT ON THIS SCREEN, IT IS THE SCREEN BEFORE IT. Three facts,
 * one mechanism:
 *
 *   1. that run's ladder log ends „calibration gate → «Пропусни»" — the I1 gate
 *      (`calibrationLocked`) was the surface immediately before the result;
 *   2. the gate and the result are the SAME mounted subtree inside the shell's
 *      one scrolling scrim (LessonPlayShell `data-hud="end-screen"` +
 *      playArea.ts OVERLAY_SCRIM_CLASS, which owns the `overflow-y-auto`).
 *      `calibrationLocked` only changes what SessionEndScreen RETURNS; the
 *      scrim never remounts, so its `scrollTop` survives the swap. The offset a
 *      thumb needed to reach «Пропусни» at the bottom of the gate card is still
 *      applied to a document five times as long;
 *   3. the PC leg of the same sweep shows no offset at all — at 900 px the gate
 *      fits in the scrim and nothing ever had to scroll.
 *
 * WHY THIS FILE READS SOURCE. The whole suite is `environment: "node"`
 * (vitest.config.ts) and no DOM package is installed, so an effect that calls
 * `scrollIntoView` on a mounted ref cannot be driven here. The precedent is
 * `hud-preferences.test.ts` / `checkControl.test.ts`: what is decidable is a
 * pure function, and the JSX that consumes it is held to its contract by
 * reading the file. Both assertions below fail on the shipped build — one
 * because it has no reset at all, the other because a reset that fires on every
 * render would fight a student who scrolled the debrief on purpose.
 */

import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const SRC = resolve(__dirname, "..");
const END_SCREEN = readFileSync(resolve(SRC, "SessionEndScreen.tsx"), "utf8");

/** Comments in this file quote the BEFORE state; assertions must read code. */
function code(src: string): string {
  return src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^[ \t]*\/\/.*$/gm, "");
}
const END_SCREEN_CODE = code(END_SCREEN);

describe("the I1 gate's scroll offset does not survive into the result", () => {
  it("FAILS ON THE SHIPPED BUILD: the result asks to be put at the top", () => {
    // The shipped file contains no scroll handling of any kind — the offset was
    // simply inherited.
    expect(END_SCREEN_CODE).toMatch(/resultRef\.current\?\.scrollIntoView\(\{\s*block:\s*"start"\s*\}\)/);
    // On our OWN root, so the browser picks whichever ancestor scrolls: this
    // component must not know that the shell's scrim is the scroll port today.
    expect(END_SCREEN_CODE).toMatch(/ref=\{resultRef\}/);
    // …and the scrim's own p-4 is given back, so the control lands where a
    // fresh mount would have put it rather than flush against the edge.
    expect(END_SCREEN_CODE).toContain("scroll-mt-4");
  });

  it("THE OTHER DIRECTION: it fires on the RELEASE, never on every render", () => {
    // A reset with no edge test would yank a student back to the top every time
    // the shell's 150 ms HUD poll re-rendered this screen — i.e. it would make
    // the debrief unreadable while claiming to fix reading it.
    const effect = END_SCREEN_CODE.match(
      /const released = [^;]+;[\s\S]{0,240}?scrollIntoView\([^)]*\);/,
    );
    expect(effect).not.toBeNull();
    const body = effect?.[0] ?? "";
    // The edge: previously locked AND no longer locked.
    expect(body).toMatch(/wasCalibrationLocked\.current\s*&&\s*!calibrationLocked/);
    // Guarded by that edge, not by the current state alone.
    expect(body).toMatch(/if \(released\)/);
    // And the ref is advanced every run, or the edge fires forever.
    expect(body).toMatch(/wasCalibrationLocked\.current = calibrationLocked/);
  });

  it("the effect re-runs only when the lock changes", () => {
    expect(END_SCREEN_CODE).toMatch(/scrollIntoView\([\s\S]{0,80}?\}, \[calibrationLocked\]\)/);
  });
});
