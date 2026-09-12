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
  IMPACT_SHAKE_FULL_KMH,
  IMPACT_SHAKE_MAX_RAD,
  IMPACT_SHAKE_MS,
  ImpactCut,
  impactCutGivesBack,
  impactCutView,
  impactFlashes,
  impactShakeAmplitudeRad,
  impactShakeOffsetRad,
  type ImpactCutHandle,
  type ImpactCutPose,
} from "../ImpactCut";
import { COLLISION_MIN_KMH } from "../VehicleRig";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const LESSON_SCENE = readFileSync(path.join(HERE, "..", "LessonScene.tsx"), "utf-8");
const CAMERA_RIG = readFileSync(path.join(HERE, "..", "CameraRig.tsx"), "utf-8");

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

/**
 * ── THE SHAKE — the row's THIRD ask, built 2026-09-12 ───────────────────────
 * The row names four things ("no impact effect, no shake, no damage, no
 * exterior cut"). The first pass built two and deferred the shake in writing,
 * „because a shake belongs to the camera itself (`CameraRig`, which every
 * lesson and both other POVs share)". Right about the risk, wrong about the
 * size — and these cells pin the two properties that made it lane-sized:
 * the shape is PURE, and the application moves ROTATION ONLY.
 */
describe("the crash jolt — the shape", () => {
  it("scales with the closing speed and saturates at the authored peak", () => {
    expect(impactShakeAmplitudeRad(IMPACT_SHAKE_FULL_KMH)).toBeCloseTo(IMPACT_SHAKE_MAX_RAD, 12);
    expect(impactShakeAmplitudeRad(500)).toBeCloseTo(IMPACT_SHAKE_MAX_RAD, 12);
    expect(impactShakeAmplitudeRad(49.9)).toBeLessThan(IMPACT_SHAKE_MAX_RAD);
  });

  it("a slow graded contact is still FELT — √, not a linear ramp", () => {
    // 5 км/ч into an oncoming car is a billed ПТП (compile.ts writes
    // `collisionMinKmh: 0` for all 150 templates). A linear ramp would hand it
    // a tenth of the peak, which on a 900 px panel is nothing at all.
    const slow = impactShakeAmplitudeRad(5);
    expect(slow).toBeGreaterThan(IMPACT_SHAKE_MAX_RAD * 0.25);
    expect(slow).toBeLessThan(IMPACT_SHAKE_MAX_RAD * 0.4);
  });

  it("a reversing crash shakes — the speed is a magnitude, not a direction", () => {
    expect(impactShakeAmplitudeRad(-30)).toBeCloseTo(impactShakeAmplitudeRad(30), 12);
  });

  it("refuses garbage, and refuses a student who asked for no motion", () => {
    expect(impactShakeAmplitudeRad(Number.NaN)).toBe(0);
    expect(impactShakeAmplitudeRad(Number.POSITIVE_INFINITY)).toBe(0);
    expect(impactShakeAmplitudeRad(50, true)).toBe(0);
  });

  it("ENDS — null past the window, so the pose handed on is exactly the rig's", () => {
    const amp = impactShakeAmplitudeRad(50);
    expect(impactShakeOffsetRad(amp, IMPACT_SHAKE_MS)).toBeNull();
    expect(impactShakeOffsetRad(amp, IMPACT_SHAKE_MS + 1000)).toBeNull();
    expect(impactShakeOffsetRad(amp, -1)).toBeNull();
    expect(impactShakeOffsetRad(0, 0)).toBeNull();
  });

  it("decays to nothing by the end of the window, on every axis", () => {
    const amp = impactShakeAmplitudeRad(50);
    const late = impactShakeOffsetRad(amp, IMPACT_SHAKE_MS - 1);
    expect(late).not.toBeNull();
    expect(Math.abs(late!.pitch)).toBeLessThan(amp * 0.01);
    expect(Math.abs(late!.roll)).toBeLessThan(amp * 0.01);
    expect(Math.abs(late!.yaw)).toBeLessThan(amp * 0.01);
  });

  it("never exceeds its own amplitude on any axis, anywhere in the window", () => {
    const amp = impactShakeAmplitudeRad(50);
    for (let ms = 0; ms < IMPACT_SHAKE_MS; ms += 1) {
      const off = impactShakeOffsetRad(amp, ms);
      expect(off).not.toBeNull();
      expect(Math.abs(off!.pitch)).toBeLessThanOrEqual(amp);
      expect(Math.abs(off!.roll)).toBeLessThanOrEqual(amp);
      expect(Math.abs(off!.yaw)).toBeLessThanOrEqual(amp);
    }
  });

  it("is DETERMINISTIC — the same crash shakes the same way on every machine", () => {
    // No Math.random(). This programme settles rendering rows by photograph,
    // and a frame of a randomised jolt can never be judged against another.
    const amp = impactShakeAmplitudeRad(37);
    expect(impactShakeOffsetRad(amp, 90)).toEqual(impactShakeOffsetRad(amp, 90));
  });

  it("actually MOVES at the instant of contact — a jolt, not an ease-in", () => {
    const amp = impactShakeAmplitudeRad(50);
    const at0 = impactShakeOffsetRad(amp, 0);
    expect(at0).not.toBeNull();
    expect(Math.abs(at0!.roll) + Math.abs(at0!.yaw)).toBeGreaterThan(amp * 0.5);
  });
});

describe("the crash jolt — where it is applied, and what it is not allowed to move", () => {
  it("rotates the camera and never writes its POSITION (the B67 contract)", () => {
    // `__camProbe.errM` is a car-local POSITION error against COCKPIT_EYE with
    // a founder-ratified 0.15 m ceiling, published a dozen lines above the
    // application point. A positional shake would move the number that row is
    // pinned to; a camera-local rotation cannot.
    expect(CAMERA_RIG).toContain("cam.quaternion.multiply(shakeQuat.setFromEuler(shakeEuler))");
    expect(CAMERA_RIG).not.toContain("cam.position.add(shake");
    expect(CAMERA_RIG).not.toContain("cam.position.x += ");
  });

  it("lands BEFORE the mirror quads, which park themselves against that pose", () => {
    // Both windows do `applyQuaternion(cam.quaternion)`. Applied after them the
    // glass would swim across the screen while the world shook behind it.
    const jolt = CAMERA_RIG.indexOf("const jolt = impactShakeStateRef.current;");
    expect(jolt).toBeGreaterThan(0);
    expect(jolt).toBeLessThan(CAMERA_RIG.indexOf("rv.glass.quaternion.copy(cam.quaternion)"));
    expect(jolt).toBeLessThan(CAMERA_RIG.indexOf("dm.glass.quaternion.copy(cam.quaternion)"));
  });

  it("allocates nothing per frame — the rig's own scratch rule", () => {
    expect(CAMERA_RIG).toContain("shakeEuler: new Euler()");
    expect(CAMERA_RIG).toContain("shakeQuat: new Quaternion()");
  });

  it("asks for one frame after the window, so a paused world cannot freeze a tilt", () => {
    // The Canvas runs `frameloop="demand"` while any card is up, so the last
    // frame of a jolt could otherwise be a permanent lean.
    expect(CAMERA_RIG).toContain("IMPACT_SHAKE_MS + 32");
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

  it("joins the rig's jolt to the cut, so ONE contact makes ONE response", () => {
    // The rig lives inside the Canvas and the cut outside it; this ref is the
    // join, and BOTH ends have to be wired or the shake is a predicate nothing
    // reads — the failure mode this programme keeps shipping.
    expect(LESSON_SCENE).toContain(
      "const impactShakeRef = useRef<ImpactShakeHandle | null>(null);",
    );
    expect(LESSON_SCENE).toContain("impactShakeRef={impactShakeRef}");
    expect(LESSON_SCENE).toContain("shakeRef={impactShakeRef}");
    // And the rig must actually FILL it, or the ref stays null for ever.
    expect(CAMERA_RIG).toContain("impactShakeRef.current = { shake };");
  });

  it("fires the jolt inside the flash's refractory window, never beside it", () => {
    // A scrape re-enters contact every few frames. The light and the jolt share
    // one gate so they can never disagree about whether that was one bang.
    const src = readFileSync(path.join(HERE, "..", "ImpactCut.tsx"), "utf-8");
    const gate = src.indexOf("lastFlashMsRef.current = now;");
    const call = src.indexOf("shakeRef?.current?.shake(impactKmh);");
    expect(gate).toBeGreaterThan(0);
    expect(call).toBeGreaterThan(gate);
    // …and inside the same block: the `const from = cameraModeRef.current;`
    // line is what closes it.
    expect(call).toBeLessThan(src.indexOf("const from = cameraModeRef.current;"));
  });

  it("through the scene's ONE writer for the view, so nothing can drift", () => {
    // `applyCameraMode` sets cameraModeRef + the cockpit flag + the HUD copy
    // together; a cut that wrote the ref directly would leave the touch view
    // rail lit on a view that is no longer live.
    expect(LESSON_SCENE).toContain("const applyCameraMode = useCallback((next: CameraMode) => {");
  });
});
