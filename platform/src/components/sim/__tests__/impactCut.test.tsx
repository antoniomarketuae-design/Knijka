/**
 * ═══════════════════════════════════════════════════════════════════════════
 * THE CRASH IS VISIBLE — sweep161 `sc-hz-brake-dont-swerve:f0023997` (major),
 * and the same failure mode the row cites in `sc-fo-brakelight-chain`.
 *
 * THE FINDING: „the camera clips inside the struck geometry and the entire
 * windscreen becomes a flat, untextured tan rectangle spanning the full view.
 * There is no impact effect, no shake, no damage, no exterior cut — just a
 * blank orange wall with the coach still talking over it."
 *
 * `ImpactCut`'s own header carries the measurement of the cited frames and the
 * reason the row's filed owner (`ScenarioObstacles.tsx`) cannot contain it.
 * This file pins the chain that makes the repair real rather than a predicate
 * nothing reads: RULES (the four refusals below) → COMPONENT (renders nothing
 * until a contact lands) → LIVE CONSUMER (`LessonScene.handleCollision`, the
 * one callback `VehicleRig.onCollisionEnter` fires on a graded contact).
 * ═══════════════════════════════════════════════════════════════════════════
 */

import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import {
  IMPACT_MIN_KMH,
  IMPACT_RELEASE_KMH,
  ImpactCut,
  impactCutGivesBack,
  impactCutView,
  impactFlashes,
  type ImpactCutHandle,
  type ImpactCutPose,
} from "../ImpactCut";
import { COLLISION_MIN_KMH } from "../VehicleRig";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const LESSON_SCENE = readFileSync(path.join(HERE, "..", "LessonScene.tsx"), "utf-8");

describe("the gate is the street's own crash threshold", () => {
  it("is VehicleRig's COLLISION_MIN_KMH, not a second opinion about it", () => {
    expect(IMPACT_MIN_KMH).toBe(COLLISION_MIN_KMH);
  });

  /**
   * EXPECTATION CHANGED — `sc-turn-left-oncoming:e91c1e01`. This cell used to
   * read `impactFlashes(2) === false` / `impactCutView("cockpit", 2, false)
   * === null`, on the reasoning „a nudge under the street tolerance is not a
   * crash". That reasoning was measured and is wrong about who reaches here:
   * `compile.ts:1346` writes `collisionMinKmh: 0` for ALL 150 scenario
   * templates, so a 2 км/ч contact with an NPC shell on a STREET drill is
   * already a billed ПТП — опасна, −10, изпитът прекратен — and this floor
   * silenced the picture of it. The kerb case the old cell was really
   * protecting never gets here at all: `gradedContactMinKmh` re-raises the
   * district drive-over surface to 10 inside VehicleRig. The bay carve-out is
   * kept below, addressed at the drill instead of at the speed.
   */
  it("a graded contact is SHOWN however slow it was — VehicleRig already judged", () => {
    expect(impactFlashes(2)).toBe(true);
    expect(impactCutView("cockpit", 2, false)).toBe("chase");
  });

  it("…and a real crash is", () => {
    expect(impactFlashes(IMPACT_MIN_KMH)).toBe(true);
    expect(impactFlashes(49.9)).toBe(true); // the blind-swerve demo's own speed
  });

  it("a garbage impact speed never fires anything", () => {
    expect(impactFlashes(Number.NaN)).toBe(false);
    expect(impactFlashes(Number.POSITIVE_INFINITY)).toBe(false);
    expect(impactCutView("cockpit", Number.NaN, false)).toBeNull();
  });
});

describe("the bay carve-out — the student parking keeps his seat", () => {
  it("a manoeuvring-speed touch in a graded bay does not take the view", () => {
    // sc-park-* are driven at 2–4 км/ч and IMPACT_RELEASE_KMH is 5, so a cut
    // here would hold for the rest of the manoeuvre.
    expect(impactCutView("cockpit", 2, false, true)).toBeNull();
    expect(impactCutView("cockpit", IMPACT_MIN_KMH - 0.1, false, true)).toBeNull();
  });

  it("but the flash still marks it — a −10 ПТП is never invisible", () => {
    expect(impactFlashes(2)).toBe(true);
  });

  it("and a REAL crash in a bay still cuts", () => {
    expect(impactCutView("cockpit", IMPACT_MIN_KMH, false, true)).toBe("chase");
    expect(impactCutView("cockpit", 30, false, true)).toBe("chase");
  });

  it("the carve-out is off unless the drill asks for it", () => {
    // Default `false`: every street lesson, which is the whole finding.
    expect(impactCutView("cockpit", 4, false)).toBe("chase");
  });
});

describe("the exterior cut", () => {
  it("takes a cockpit crash to chase — the frame the mistake is legible in", () => {
    expect(impactCutView("cockpit", 49.9, false)).toBe("chase");
  });

  it("leaves chase and top-down alone: those already show the car", () => {
    expect(impactCutView("chase", 49.9, false)).toBeNull();
    expect(impactCutView("topdown", 49.9, false)).toBeNull();
  });

  it("a second bang does not overwrite the seat the student is owed back", () => {
    expect(impactCutView("cockpit", 49.9, true)).toBeNull();
  });
});

describe("and the view is given back", () => {
  it("when he drives away again", () => {
    expect(impactCutGivesBack("chase", IMPACT_RELEASE_KMH + 0.1)).toBe(true);
  });

  it("never while he is still sitting in the mess he made", () => {
    expect(impactCutGivesBack("chase", 0)).toBe(false);
    expect(impactCutGivesBack("chase", IMPACT_RELEASE_KMH)).toBe(false);
  });

  it("reversing out of it counts — the speed is a magnitude, not a direction", () => {
    expect(impactCutGivesBack("chase", -(IMPACT_RELEASE_KMH + 0.1))).toBe(true);
  });

  it("and NEVER overrules a student who reached for the view himself", () => {
    expect(impactCutGivesBack("cockpit", 40)).toBe(false);
    expect(impactCutGivesBack("topdown", 40)).toBe(false);
  });

  it("no sample yet ⇒ no restore (an absent read is not a moving car)", () => {
    expect(impactCutGivesBack("chase", null)).toBe(false);
    expect(impactCutGivesBack("chase", undefined)).toBe(false);
  });
});

describe("the component itself", () => {
  it("renders NOTHING until a contact lands — it is not a layer over the canvas", () => {
    const handleRef: { current: ImpactCutHandle | null } = { current: null };
    const sampleRef: { current: ImpactCutPose | null } = { current: { speedKmh: 0 } };
    const cameraModeRef = { current: "cockpit" as const };
    const html = renderToStaticMarkup(
      <ImpactCut
        handleRef={handleRef}
        sampleRef={sampleRef}
        cameraModeRef={cameraModeRef}
        applyCameraMode={() => {}}
      />,
    );
    expect(html).toBe("");
  });
});

describe("the live consumer — LessonScene, on the one graded-contact callback", () => {
  it("mounts the cut and hands it the impact speed", () => {
    // `handleCollision` is what `VehicleRig.onCollisionEnter` calls once the
    // contact clears `gradedContactMinKmh`; before this repair its first
    // parameter was named `_impactKmh` because nothing read it.
    expect(LESSON_SCENE).toContain("impactCutRef.current?.impact(impactKmh)");
    expect(LESSON_SCENE).toContain("<ImpactCut");
    expect(LESSON_SCENE).toContain("handleRef={impactCutRef}");
    expect(LESSON_SCENE).toContain("applyCameraMode={applyCameraMode}");
  });

  it("and tells it which drills are manoeuvred, off the spec's own bay", () => {
    // e91c1e01: without this the carve-out defaults off everywhere, which is
    // right for the street and wrong for the bay — and a prop nobody passes is
    // the dead predicate this programme keeps shipping.
    expect(LESSON_SCENE).toContain("manoeuvring={lesson.parkingBay !== undefined}");
  });

  it("through the scene's ONE writer for the view, so nothing can drift", () => {
    // `applyCameraMode` sets cameraModeRef + the cockpit flag + the HUD copy
    // together; a cut that wrote the ref directly would leave the touch view
    // rail lit on a view that is no longer live.
    expect(LESSON_SCENE).toContain("const applyCameraMode = useCallback((next: CameraMode) => {");
  });
});
