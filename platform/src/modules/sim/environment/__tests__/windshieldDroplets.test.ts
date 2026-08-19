/**
 * =============================================================================
 * THE RAIN THAT FELL INSIDE THE CAR
 * — catalogue sweep 161, sc-ac-rain-lights, routed to WindshieldDroplets.tsx.
 * =============================================================================
 *
 * THE FRAME, BEFORE ANYTHING WAS CHANGED:
 *   .audit-frames/sweep161/sc-ac-rain-lights/pc-right/04-t090s.png (1440 × 900)
 *     · round droplets over the dashboard, the wheel rim, the door card and the
 *       cockpit control label row — one beside СВЕТЛИНИ, one below КОЛАН;
 *     · and, cropped to the binnacle, one ON THE SPEEDOMETER DIAL FACE, in a
 *       lesson graded on „дръж под 47 км/ч".
 *
 * WHAT THIS FILE HOLDS. The fix is a depth: the sheet stops compositing over
 * every pixel and is placed where the cabin occludes it. `ndcDepthForDistance`
 * is the whole of the pure half — the mapping from a view-space distance to the
 * `gl_Position.z` the fullscreen triangle is drawn at. The CABIN/WORLD ordering
 * below is the fix stated as arithmetic: it is the property the frame needed,
 * and it is checked against the real measured distances rather than against the
 * round number the constant happens to be.
 *
 * The GL half cannot be rendered here (jsdom has no WebGL, and a mocked
 * three.js would assert against the mock), so the wiring block at the bottom
 * reads this module's own source — the technique `briefingOverflow.test.tsx`
 * and `notify-column.test.ts` use, and comment-stripped for the reason that
 * file learned the hard way: the header block above QUOTES `depthTest: false`
 * while explaining why it is gone, so a bare source search would find the
 * paragraph and certify the defect it describes.
 *
 * EVERY CASE BELOW FAILS ON THE PRE-FIX BEHAVIOUR. The shipped value is not
 * merely absent from this file, it is IN it, as the negative control: the
 * triangle used to emit `gl_Position.z = 0.0`, and §2 proves that number put
 * the sheet 0.2 m from the eye — in front of the steering wheel — which is why
 * turning `depthTest` on without moving the sheet would have changed nothing at
 * all, and why a test that only asserted the flag would have passed on a frame
 * still full of droplets.
 */

import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { PerspectiveCamera, Vector3 } from "three";
import { describe, expect, it } from "vitest";
import { GLASS_SHEET_DISTANCE_M, ndcDepthForDistance } from "../WindshieldDroplets";

/** The Canvas's own camera (LessonScene.tsx `camera={{ near: 0.1, far: 900 }}`). */
const NEAR = 0.1;
const FAR = 900;
const ndc = (d: number) => ndcDepthForDistance(d, NEAR, FAR);

/**
 * Distances from COCKPIT_EYE (0.24, 0.71, −0.255), metres — the derivation is
 * in the module header. These are the numbers the fix is true or false about;
 * they are measured off the shipped constants, not chosen.
 */
const CABIN = {
  wheelRim: 0.51,
  cluster: 0.66,
  glassHeader: 0.905,
  cowl: 1.198,
  glassCowlEdge: 1.23,
  mirrorRight: 1.107,
  /** The farthest thing in the cabin, and therefore the binding constraint. */
  mirrorLeft: 1.447,
} as const;

const WORLD = {
  /** Nearest tarmac visible over the cowl lip — the other binding constraint. */
  tarmac: 4.537,
  leadCar: 15,
  building: 60,
} as const;

/* ─────────────────────────────────────────────────────────────────────────────
   1 · THE MAPPING IS THE PROJECTION'S, NOT AN APPROXIMATION OF IT
   ────────────────────────────────────────────────────────────────────────── */

describe("ndcDepthForDistance · standard perspective depth", () => {
  /**
   * THE ORACLE IS THREE'S OWN PROJECTION MATRIX, not a second copy of the
   * formula. `Vector3.applyMatrix4` performs the perspective divide, so this is
   * literally the z the renderer will compare against the depth buffer for a
   * point d metres down the view axis.
   *
   * That matters beyond arithmetic. The module's mapping is only correct while
   * three leaves `reversedDepthBuffer` off and the Canvas asks for no
   * logarithmic buffer — assumptions written in a comment, which is where
   * assumptions go to stop being checked. Under either change this camera's
   * matrix changes with it and these cases go red, which is the only way the
   * paragraph can be held to its word.
   */
  const projected = (d: number) => {
    const cam = new PerspectiveCamera(50, 16 / 9, NEAR, FAR);
    cam.updateProjectionMatrix();
    return new Vector3(0, 0, -d).applyMatrix4(cam.projectionMatrix).z;
  };

  it("agrees with three's real perspective matrix across the whole band", () => {
    for (const d of [0.2, 0.51, 0.905, 1.447, 2.5, 4.537, 15, 60, 400]) {
      expect(ndc(d)).toBeCloseTo(projected(d), 10);
    }
  });

  it("maps the frustum planes to −1 and +1 (up to the deliberate clamp)", () => {
    // Unclamped the endpoints are exact; the clamp holds the sheet a thousandth
    // inside each plane on purpose (§4), so these are close, not equal.
    expect(projected(NEAR)).toBeCloseTo(-1, 12);
    expect(projected(FAR)).toBeCloseTo(1, 12);
    expect(ndc(NEAR)).toBeGreaterThan(-1);
    expect(ndc(NEAR)).toBeLessThan(-0.99);
    expect(ndc(FAR)).toBeLessThan(1);
    expect(ndc(FAR)).toBeGreaterThan(0.99);
  });

  it("is strictly increasing with distance — nearer is less", () => {
    // The entire fix is a `<` between two of these. If the mapping were flat or
    // inverted anywhere in the cabin/world band, occlusion would be decided the
    // wrong way round and every assertion in §3 would still be readable.
    const ds = [0.2, 0.51, 0.905, 1.447, 2.5, 4.537, 15, 60, 400];
    for (let i = 1; i < ds.length; i += 1) {
      expect(ndc(ds[i])).toBeGreaterThan(ndc(ds[i - 1]));
    }
  });

  it("survives the inputs a broken camera hands it", () => {
    expect(ndcDepthForDistance(2.5, Number.NaN, FAR)).toBe(0);
    expect(ndcDepthForDistance(2.5, NEAR, Number.NaN)).toBe(0);
    expect(ndcDepthForDistance(2.5, 0, FAR)).toBe(0);
    expect(ndcDepthForDistance(2.5, FAR, NEAR)).toBe(0);
    expect(ndcDepthForDistance(2.5, NEAR, NEAR)).toBe(0);
  });
});

/* ─────────────────────────────────────────────────────────────────────────────
   2 · THE NEGATIVE CONTROL — what the shipped triangle actually did
   ────────────────────────────────────────────────────────────────────────── */

describe("the shipped `gl_Position.z = 0.0` put the sheet in front of the wheel", () => {
  it("NDC 0 is 0.2 m from the eye under this projection", () => {
    // 2·far·near/(far+near) = 2·900·0.1/900.1. The sheet was nearer than the
    // steering wheel, so `depthTest: false` was not the whole defect — it was
    // the only thing hiding a second one.
    expect(ndc(0.2)).toBeCloseTo(0, 3);
  });

  it("…so it was nearer than EVERY part of the cabin — nothing could occlude it", () => {
    // This is the frame, as an inequality. If a future change moves the sheet
    // back toward the eye, this is the case that says so.
    for (const [name, d] of Object.entries(CABIN)) {
      expect(ndc(0.2), `${name} could not occlude a sheet at 0.2 m`).toBeLessThan(ndc(d));
    }
  });

  it("and the fixed sheet is on the other side of all of them", () => {
    // The same loop, same numbers, opposite verdict — the pair is the point.
    for (const [name, d] of Object.entries(CABIN)) {
      expect(ndc(GLASS_SHEET_DISTANCE_M), `${name} must occlude the sheet`).toBeGreaterThan(
        ndc(d),
      );
    }
  });
});

/* ─────────────────────────────────────────────────────────────────────────────
   3 · THE ORDERING THE FIX IS: cabin occludes, world does not
   ────────────────────────────────────────────────────────────────────────── */

describe("GLASS_SHEET_DISTANCE_M sits in the gap the cockpit rig leaves", () => {
  it("clears the FARTHEST cabin surface, which is the left mirror housing", () => {
    // Not the windshield's own cowl edge (1.23 m): the door mirror at 1.447 m
    // is farther, and a sheet placed on the glass would have painted droplets
    // across the mirror the student is being taught to check.
    expect(GLASS_SHEET_DISTANCE_M).toBeGreaterThan(CABIN.mirrorLeft);
    expect(ndc(GLASS_SHEET_DISTANCE_M)).toBeGreaterThan(ndc(CABIN.mirrorLeft));
  });

  it("stays nearer than the nearest tarmac the driver can see", () => {
    // THE OTHER DIRECTION, and it is the one that matters most: a sheet pushed
    // past the road would be occluded BY the road, and rain would silently stop
    // existing in the lesson whose subject is rain. A refusal to draw is as
    // wrong as drawing in the wrong place.
    expect(GLASS_SHEET_DISTANCE_M).toBeLessThan(WORLD.tarmac);
    for (const [name, d] of Object.entries(WORLD)) {
      expect(ndc(GLASS_SHEET_DISTANCE_M), `${name} must NOT occlude the sheet`).toBeLessThan(
        ndc(d),
      );
    }
  });

  it("keeps real margin at both ends rather than grazing a bound", () => {
    // The constant is the geometric midpoint of the two bounds, so the margins
    // are multiplicative and roughly equal. A change that halves either one is
    // a change that should be argued for on a frame.
    expect(GLASS_SHEET_DISTANCE_M / CABIN.mirrorLeft).toBeGreaterThan(1.5);
    expect(WORLD.tarmac / GLASS_SHEET_DISTANCE_M).toBeGreaterThan(1.5);
  });
});

/* ─────────────────────────────────────────────────────────────────────────────
   4 · THE SHEET CAN NEVER BE CLIPPED AWAY — the failure that would look fine
   ────────────────────────────────────────────────────────────────────────── */

describe("the clamp keeps the layer inside the frustum", () => {
  it("a distance past the far plane still yields a drawable depth", () => {
    // ndc > 1 is depth-clipped: the triangle is not drawn AT ALL, and rain
    // vanishes with no error anywhere. The clamp is what makes a misconfigured
    // camera cost a wrong-looking sheet instead of an absent one.
    expect(ndcDepthForDistance(5000, NEAR, FAR)).toBeLessThan(1);
    expect(ndcDepthForDistance(5000, NEAR, FAR)).toBeGreaterThan(0.99);
    // A far plane that lands INSIDE the cabin band is the realistic version of
    // this (a lesson that tightens `far`); it must still draw.
    expect(ndcDepthForDistance(GLASS_SHEET_DISTANCE_M, NEAR, 2)).toBeLessThan(1);
  });

  it("a distance in front of the near plane does not go under −1 either", () => {
    expect(ndcDepthForDistance(0.001, NEAR, FAR)).toBeGreaterThan(-1);
    expect(ndcDepthForDistance(-5, NEAR, FAR)).toBeGreaterThan(-1);
    expect(ndcDepthForDistance(Number.NaN, NEAR, FAR)).toBeGreaterThan(-1);
  });
});

/* ─────────────────────────────────────────────────────────────────────────────
   5 · THE GL HALF — held against this module's own source
   ────────────────────────────────────────────────────────────────────────── */

const SRC = readFileSync(resolve(__dirname, "../WindshieldDroplets.tsx"), "utf8");

/**
 * Code only. The header block quotes `depthTest: false` in the sentence saying
 * it is gone — exactly the trap `briefingOverflow.test.tsx` documents — so an
 * assertion that cannot tell code from the paragraph describing it would read
 * this file's own explanation as the defect.
 */
const CODE = SRC.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");

describe("the material and the triangle are actually wired to the depth", () => {
  it("strips its own prose — the guard against guarding a comment", () => {
    expect(SRC).toContain("depthTest: false"); // the header block explains it
    expect(CODE).not.toContain("depthTest: false"); // the code does not do it
  });

  it("depth-tests, and still does not write depth", () => {
    expect(CODE).toContain("depthTest: true");
    expect(CODE).toContain("depthWrite: false");
  });

  it("the triangle takes its z from the uniform, not from a literal", () => {
    // The shipped line was `gl_Position = vec4(position.xy, 0.0, 1.0);`.
    expect(CODE).toContain("gl_Position = vec4(position.xy, uDepthNdc, 1.0)");
    expect(CODE).not.toContain("vec4(position.xy, 0.0, 1.0)");
    expect(CODE).toContain("uniform float uDepthNdc");
  });

  it("the uniform is declared and fed every frame", () => {
    expect(CODE).toContain("uDepthNdc: { value: 0 }");
    expect(CODE).toContain("material.uniforms.uDepthNdc.value = ndcDepthForDistance(");
  });

  it("the wiped arc and the med+/dry gates are untouched by this fix", () => {
    // The droplet field's own behaviour was not the defect; a "fix" that also
    // quietly disabled the wiper channel or started drawing on a dry road would
    // pass every case above.
    expect(CODE).toContain("uWipeLevel");
    expect(CODE).toContain('level === "low" || effective <= 0.01');
  });
});
