/**
 * A1 spawn policy over the lesson curriculum (specs.ts): every lesson starts
 * COLD (engine off, selector P, parking brake on — LessonSpec.vehicleStart
 * absent → the scene defaults to "cold") except the L0 acclimatization free
 * drive, which explicitly opts into "ready". The 3D-instructor floor: the
 * student must start, gear and release the car before it moves.
 */

import { describe, expect, it } from "vitest";
import { LESSONS, lessonById } from "../specs";

describe("lesson vehicleStart policy (A1)", () => {
  it("L0 free drive is the only ready-to-drive spawn", () => {
    expect(lessonById("l0-free-drive")?.vehicleStart).toBe("ready");
    for (const lesson of LESSONS) {
      if (lesson.id === "l0-free-drive") continue;
      expect(lesson.vehicleStart, lesson.id).toBeUndefined(); // default = cold
    }
  });

  it("the pre-drive lesson (L1) relies on the cold default — the checklist starts the car", () => {
    const l1 = lessonById("l1-preparation");
    expect(l1?.preDrive).toBe(true);
    expect(l1?.vehicleStart).toBeUndefined();
  });
});
