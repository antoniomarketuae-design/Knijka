/**
 * B24 — THE TURN MAY NOT ANNOUNCE ITSELF AT THE STOP LINE.
 *
 * Founder, catalog 11 «Знак Стоп»: *„the moment I cross the marking after the
 * stop line the green line changes to right."* He read the machine exactly
 * right. `sc-jstop-line` is a `passSignal`, so it completes on the very frame
 * the nose crosses the paint (measured in /dev/drive-rig at **y = −27.72**, the
 * graded line to the centimetre). On that frame `uGoalS` advances, and the
 * stretch of ribbon running into the east arm stops being „past the goal" and
 * jumps to full strength. At the shipped 0.42 that stretch had been drawn at
 * 0.42 × the ribbon's own 0.42 uOpacity — ~18 % effective, additive, on daylit
 * asphalt — i.e. invisible. So the right turn ANNOUNCED ITSELF BY APPEARING, at
 * the one moment instruction 4 («Огледай се: наляво, надясно и пак наляво»)
 * wants his eyes on the junction and not on the glass.
 *
 * The geometry half was already right and is already gated: `deriveGuidanceRoute`
 * chains look-ahead legs until a turn is on the ribbon, pinned in
 * `scene/guidance-geometry.test.ts` („the right turn is on the ribbon from the
 * SPAWN"). Every one of those tests passed while the founder's sentence was
 * true, because the defect was never in the geometry — it was one float in a
 * shader string. That is what this file exists to stop.
 *
 * THE EVIDENCE THIS PINS (scratchpad only — frames never enter the repo):
 *   · `laneSL/strip/B24S-s05-y-28.44-…obj1` and `…-s07-y-27.68-…obj2`, 0.76 m
 *     apart across the flip: the same band, the same reach, the same brightness.
 *   · `laneSL/strip/B24S-s01-y-52.48-…`: 24.8 m out, the gate bar and «Спри на
 *     стоп-линията» stand across the lane and the ribbon already bends right
 *     past them.
 *   · `laneSL/canvas/B24c-A-stopline-y-30.9-obj1.png`: the same, at the lawful
 *     full stop 3.2 m short of the paint.
 */

import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { BEYOND_GOAL_OPACITY } from "./RouteGuidance";

/** What shipped when the founder wrote the row. */
const SHIPPED_WHEN_HE_SAW_IT = 0.42;

describe("B24 — the look-ahead leg is legible BEFORE the line, not because of it", () => {
  it("crossing the paint may not brighten the turn by more than a fifth", () => {
    // legMix goes BEYOND_GOAL_OPACITY → 1.0 the instant the objective flips.
    // That difference IS his sentence, expressed as a number: the smaller it
    // is, the less „the green line changes" at the crossing. 0.80 leaves a
    // 20 % step, which the 0.76 m frame pair could not resolve on the glass.
    expect(1 - BEYOND_GOAL_OPACITY).toBeLessThanOrEqual(0.2 + 1e-9);
  });

  it("…and is far brighter than the value that produced the complaint", () => {
    // Not „different from 0.42" — decisively above it. Under additive blending
    // the announcement's effective alpha is BEYOND_GOAL_OPACITY × the ribbon's
    // own 0.42, so this ratio is the whole visibility change.
    expect(BEYOND_GOAL_OPACITY / SHIPPED_WHEN_HE_SAW_IT).toBeGreaterThan(1.75);
  });

  it("but still quieter than the active leg — the announcement is not the task", () => {
    // Which task is now is carried by the marker (gate bar + label + ground
    // pool), never by ribbon brightness. A look-ahead leg at 1.0 would make the
    // ribbon say two things at once.
    expect(BEYOND_GOAL_OPACITY).toBeLessThan(1);
    expect(BEYOND_GOAL_OPACITY).toBeGreaterThan(0.5);
  });

  /**
   * The constant lives in a GLSL template string. Export it, and a future edit
   * can silently stop USING it — the number would stay right, the ribbon would
   * go back to 0.42, and every assertion above would still pass. So the wiring
   * is asserted against the source itself.
   */
  it("is actually compiled into the ribbon shader's legMix, not just exported", () => {
    const src = readFileSync(new URL("./RouteGuidance.tsx", import.meta.url), "utf8");
    const frag = src.slice(src.indexOf("const RIBBON_FRAG"), src.indexOf("const PILLAR_VERT"));
    expect(frag).toContain("uGoalS");
    expect(frag).toMatch(/legMix\s*=\s*mix\(1\.0,\s*\$\{BEYOND_GOAL_OPACITY\.toFixed\(2\)\}/);
    // …and interpolated as a number the GLSL compiler will accept.
    expect(BEYOND_GOAL_OPACITY.toFixed(2)).toBe("0.80");
  });
});
