/**
 * D11 — the „Поглед отгоре" discoverability cue (founder review 2026-07-30).
 *
 * „4. Тясно гнездо — here this is a specific case, where we can Ping somewhere
 *  on the screen with low brightness/contrast Press G for Eagle View, because
 *  its beginning and the user may not know of existing G option … This
 *  reminder should appear only when relevant."
 *
 * „Only when relevant" is the part with teeth, so it is what these tests pin:
 * the cue may not exist on a lesson without a bay/turn maneuver, on an exam,
 * on a rung that has locked top-down out, or above the beginner rungs — and at
 * runtime it may fire at most once, only while reverse is really engaged, and
 * never while the student is already looking from above.
 */

import { describe, expect, it } from "vitest";
import type { LessonSpec } from "../../contracts";
import {
  CAMERA_HINT_ARM_SEC,
  CAMERA_HINT_VISIBLE_SEC,
  cameraAidHintEligible,
  createCameraAidHintState,
  lessonHasOverheadManeuver,
  observeCameraAidHint,
  type CameraAidHintState,
} from "../overheadHint";

type EligibilityLesson = Pick<LessonSpec, "id" | "order" | "objectives" | "examMode">;

function bayLesson(overrides: Partial<EligibilityLesson> = {}): EligibilityLesson {
  return {
    id: "sc-park-narrow@L1",
    order: 1,
    objectives: [
      { id: "approach", titleBg: "Приближи", kind: "reachZone", params: { x: 0, y: 6 } },
      {
        id: "park",
        titleBg: "Паркирай",
        kind: "completeManeuver",
        params: { maneuver: "parkInBay", holdSec: 1.5 },
      },
    ],
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// Eligibility
// ---------------------------------------------------------------------------

describe("cameraAidHintEligible", () => {
  it("fires on the tight-parking drill he actually reported", () => {
    expect(cameraAidHintEligible(bayLesson(), true)).toBe(true);
  });

  it("needs a maneuver the overhead view is FOR", () => {
    const noManeuver = bayLesson({
      objectives: [{ id: "a", titleBg: "Карай", kind: "driveDistance", params: { meters: 300 } }],
    });
    expect(lessonHasOverheadManeuver(noManeuver)).toBe(false);
    expect(cameraAidHintEligible(noManeuver, true)).toBe(false);

    const roundabout = bayLesson({
      objectives: [
        { id: "a", titleBg: "Кръгово", kind: "completeManeuver", params: { maneuver: "roundabout" } },
      ],
    });
    expect(cameraAidHintEligible(roundabout, true)).toBe(false);

    const threePoint = bayLesson({
      objectives: [
        {
          id: "a",
          titleBg: "Обръщане в три маневри",
          kind: "completeManeuver",
          params: { maneuver: "threePointTurn" },
        },
      ],
    });
    expect(cameraAidHintEligible(threePoint, true)).toBe(true);
  });

  it("never advertises a view the rung has locked out", () => {
    expect(cameraAidHintEligible(bayLesson(), false)).toBe(false);
  });

  it("is off on the exam and above the beginner rungs", () => {
    expect(cameraAidHintEligible(bayLesson({ examMode: true }), true)).toBe(false);
    expect(cameraAidHintEligible(bayLesson({ id: "sc-park-narrow@L3" }), true)).toBe(true);
    expect(cameraAidHintEligible(bayLesson({ id: "sc-park-narrow@L4" }), true)).toBe(false);
    expect(cameraAidHintEligible(bayLesson({ id: "sc-park-narrow@L5" }), true)).toBe(false);
  });

  it("covers Урок 7 'Паркиране' — a curriculum order is not a difficulty rung", () => {
    // `order: 7` is a syllabus position, not level 7. Reading it as a rung
    // would exclude the one curriculum lesson that reverses into a bay.
    expect(cameraAidHintEligible(bayLesson({ id: "l7-parking", order: 7 }), true)).toBe(true);
    // …but the exam route, which also parks, is still excluded.
    expect(
      cameraAidHintEligible(bayLesson({ id: "lex-exam-1", order: 8, examMode: true }), true),
    ).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// Runtime phase machine
// ---------------------------------------------------------------------------

const DT = 0.2;

function hold(s: CameraAidHintState, gearLabel: string, seconds: number, topdown = false): void {
  for (let t = 0; t < seconds - 1e-9; t += DT) {
    observeCameraAidHint(s, { gearLabel, topdown, dtSec: DT });
  }
}

describe("observeCameraAidHint", () => {
  it("stays silent while the car is in D or P", () => {
    const s = createCameraAidHintState();
    hold(s, "D", 30);
    expect(s.phase).toBe("off");
    hold(s, "P", 30);
    expect(s.phase).toBe("off");
  });

  it("shows only after reverse is HELD — a bounce through R flashes nothing", () => {
    const s = createCameraAidHintState();
    hold(s, "R", CAMERA_HINT_ARM_SEC - 0.4);
    expect(s.phase).toBe("off");
    observeCameraAidHint(s, { gearLabel: "P", topdown: false, dtSec: DT });
    expect(s.reverseHeldSec).toBe(0);

    hold(s, "R", CAMERA_HINT_ARM_SEC + DT);
    expect(s.phase).toBe("hint");
  });

  it("confirms and retires the moment the student takes it", () => {
    const s = createCameraAidHintState();
    hold(s, "R", CAMERA_HINT_ARM_SEC + DT);
    expect(s.phase).toBe("hint");

    expect(observeCameraAidHint(s, { gearLabel: "R", topdown: true, dtSec: DT })).toBe(true);
    expect(s.phase).toBe("done");

    hold(s, "R", 3); // the ✓ fades
    expect(s.phase).toBe("off");

    // …and never speaks again, however much reversing follows.
    hold(s, "R", 60);
    expect(s.phase).toBe("off");
  });

  it("retires itself if ignored, so it can never become furniture", () => {
    const s = createCameraAidHintState();
    hold(s, "R", CAMERA_HINT_ARM_SEC + DT);
    expect(s.phase).toBe("hint");
    hold(s, "R", CAMERA_HINT_VISIBLE_SEC + DT);
    expect(s.phase).toBe("off");
    hold(s, "R", 60);
    expect(s.phase).toBe("off");
  });

  it("never appears to a student who is ALREADY in top-down", () => {
    const s = createCameraAidHintState();
    hold(s, "R", 30, true);
    expect(s.phase).toBe("off");
    // Leaving top-down later does not resurrect it — he has seen the view.
    hold(s, "R", 30, false);
    expect(s.phase).toBe("off");
  });

  it("reports a visible change only on transitions (no re-render churn)", () => {
    const s = createCameraAidHintState();
    let changes = 0;
    for (let t = 0; t < 10; t += DT) {
      if (observeCameraAidHint(s, { gearLabel: "R", topdown: false, dtSec: DT })) changes += 1;
    }
    expect(changes).toBe(1); // off → hint, and nothing else for ten seconds
  });
});
