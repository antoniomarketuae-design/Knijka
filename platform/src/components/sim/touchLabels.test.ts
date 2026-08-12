import { describe, expect, it } from "vitest";
import { driveAxisLabelBg, reverseGestureLive } from "./TouchControls";
import { shouldRemapReversePedals } from "@/modules/sim/engine";
import type { TransmissionMode } from "@/modules/sim/vehicle";

/**
 * =============================================================================
 * THE TOUCH LAYER'S LABELS AGAINST WHAT THE CONTROLS ACTUALLY DO — 2026-08-11.
 *
 * The drivetrain pad's accessible name has always ended
 *
 *     „…спряла кола: пусни и натисни пак надолу за назад"
 *
 * and that sentence is FALSE in two whole modes. A sighted student finds out by
 * pressing and getting nothing; a screen-reader user is simply told the control
 * does something it does not do, with no way to discover otherwise — which is
 * why this is the same THEO-4 defect as a silent refusal and not a nicety.
 *
 * The KEYBOARD legend was fixed for exactly this on 2026-08-11
 * (`ControlsHelp.reverseAssistEnabled` — „на изпит заден ход се избира само с
 * лоста"). The touch layer, which is the ONLY input a phone student has, was
 * not. This file is the gate that keeps the two in step.
 *
 * WHY A UNIT TEST AND NOT A BROWSER SWEEP. The label is a string chosen from
 * three booleans; a browser can tell you what one rung renders, not that the
 * mapping is total. `TouchControls` already exports its geometry for the same
 * reason (touchArc.test.ts).
 * =============================================================================
 */

const MODES: TransmissionMode[] = ["automatic", "manual"];

/** The clause that is only true when the assist AND the pedal swap are live. */
const GESTURE_CLAUSE = "пусни и натисни пак надолу";
/** …and the one that describes the SWAP („down is now the accelerator"). */
const SWAPPED_CLAUSE = "надолу назад";

describe("reverseGestureLive — the pad's promise, asked of the mapper", () => {
  it("is off on an exam rung, in every gearbox", () => {
    for (const t of MODES) expect(reverseGestureLive(false, t)).toBe(false);
  });

  it("is off on „Напреднал“ even in a lesson: the manual gate needs the clutch", () => {
    // vehicle/driveline.ts: „going INTO a gear (N→M, N→R) … requires the
    // clutch", so the assist's D→N→R stops at N and the car sits in neutral.
    expect(reverseGestureLive(true, "manual")).toBe(false);
  });

  it("is on exactly where the pedal mapper is on — one rule, one source", () => {
    // The point of deriving it from `shouldRemapReversePedals` rather than
    // re-stating `transmission === "automatic"`: if that rule ever moves, the
    // label follows it instead of quietly disagreeing with it.
    for (const t of MODES) {
      expect(reverseGestureLive(true, t)).toBe(shouldRemapReversePedals("R", t));
    }
  });
});

describe("driveAxisLabelBg — no label describes a mode the student is not in", () => {
  it("a lesson on an automatic keeps both of the labels it always had", () => {
    expect(driveAxisLabelBg(false, true, "automatic")).toContain(GESTURE_CLAUSE);
    expect(driveAxisLabelBg(true, true, "automatic")).toContain(SWAPPED_CLAUSE);
  });

  it("an exam rung never promises the gesture — in D or in R", () => {
    for (const inReverse of [false, true]) {
      const label = driveAxisLabelBg(inReverse, false, "automatic");
      expect(label).not.toContain(GESTURE_CLAUSE);
      expect(label).not.toContain(SWAPPED_CLAUSE);
    }
  });

  it("…and says where reverse actually IS on an exam: the lever", () => {
    expect(driveAxisLabelBg(false, false, "automatic")).toContain("лоста");
    // The gate is P—R—N—D, so two ◄P taps from D reach R, and the sheet has
    // that stepper. The label points at a control that exists.
    expect(driveAxisLabelBg(false, false, "automatic")).toContain("D → N → R");
  });

  it("„Напреднал“ is told about the clutch, not about an exam", () => {
    const label = driveAxisLabelBg(false, reverseGestureLive(true, "manual"), "manual");
    expect(label).toContain("съединител");
    expect(label).not.toContain("изпит");
    expect(label).not.toContain(GESTURE_CLAUSE);
  });

  it("in R with no swap, UP is still the accelerator and the label says so", () => {
    // The half that is easy to miss: „надолу назад, нагоре спирачка" describes
    // the SWAP, and there is no swap on an exam or on the manual tier — up is
    // the accelerator and the car moves backwards, exactly as in a real car.
    for (const t of MODES) {
      const label = driveAxisLabelBg(true, false, t);
      expect(label).toContain("нагоре газ");
      expect(label).not.toContain(SWAPPED_CLAUSE);
    }
  });

  /**
   * THE NEGATIVE CONTROL. Every assertion above is a `not.toContain`, and a
   * `not.toContain` passes just as happily against an empty string, a typo in
   * the needle, or a function that returns "" in every branch. So: the two
   * needles must be findable SOMEWHERE, and every branch must produce a real
   * sentence about this control.
   */
  it("the needles are real and every branch answers", () => {
    expect(driveAxisLabelBg(false, true, "automatic")).toContain(GESTURE_CLAUSE);
    expect(driveAxisLabelBg(true, true, "automatic")).toContain(SWAPPED_CLAUSE);
    const seen = new Set<string>();
    for (const inReverse of [false, true]) {
      for (const live of [false, true]) {
        for (const t of MODES) {
          const label = driveAxisLabelBg(inReverse, live, t);
          expect(label.startsWith("Ход — ")).toBe(true);
          expect(label.length).toBeGreaterThan(40);
          seen.add(label);
        }
      }
    }
    // Four distinct sentences: (gesture live × D/R) and (no gesture × D/R),
    // with the no-gesture D case splitting again by gearbox — five in all.
    expect(seen.size).toBe(5);
  });
});
