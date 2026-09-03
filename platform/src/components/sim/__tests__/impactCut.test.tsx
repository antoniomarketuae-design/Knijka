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

  it("a nudge under it is not a crash — the parking family's cone kiss", () => {
    // sc-park-* pass `collisionMinKmh: 0` so ANY touch GRADES. It must not also
    // throw a student mid-manoeuvre out of the seat he is manoeuvring from.
    expect(impactFlashes(2)).toBe(false);
    expect(impactCutView("cockpit", 2, false)).toBeNull();
  });

  it("…and a real crash is", () => {
    expect(impactFlashes(IMPACT_MIN_KMH)).toBe(true);
    expect(impactFlashes(49.9)).toBe(true); // the blind-swerve demo's own speed
  });

  it("a garbage impact speed never fires anything", () => {
    expect(impactFlashes(Number.NaN)).toBe(false);
    expect(impactFlashes(Number.POSITIVE_INFINITY)).toBe(false);
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

  it("through the scene's ONE writer for the view, so nothing can drift", () => {
    // `applyCameraMode` sets cameraModeRef + the cockpit flag + the HUD copy
    // together; a cut that wrote the ref directly would leave the touch view
    // rail lit on a view that is no longer live.
    expect(LESSON_SCENE).toContain("const applyCameraMode = useCallback((next: CameraMode) => {");
  });
});
