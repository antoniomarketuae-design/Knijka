/**
 * Control-visibility gate (doc 66 R2, pilot-v2 cause 3) — REAL data, no
 * fixtures: for every pilot clip whose card carries a positioned governing
 * control, replay the committed trace against the district's RENDERED sign
 * posts (buildWorldGeometry — the world's own builder) and prove with pure
 * frustum math that the planned camera actually shows the control:
 *
 *  1. the card's approxPos IS a rendered post of the governing kind (the
 *     clipPlanBuilder snap — the camera aims at a pole that exists);
 *  2. at the WINDOW START the control sits inside the planned chase camera's
 *     horizontal cone, in front of the lens (k0 shows the sign ahead);
 *  3. before the ghost passes it, the control comes within legibility range
 *     while still in the cone (the sign PASSES THROUGH frame, not a speck).
 *
 * Plus the two documented exceptions:
 *  - sc-ov-oneway__m0: the world places NO В1 post (unwired asset) — the
 *    card must say so (СЪДЪРЖАНИЕ note), never fake visibility;
 *  - sc-vu-emergency__m0 (cause 2): the rear-aware camera must cover the
 *    ambulance's whole approach corridor BEHIND the ghost — the chase cone
 *    cannot (that is why the card switches profiles).
 */
import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { CLIP_PLAN } from "@/modules/learning";
import { scenarioById } from "@/modules/sim/lessons";
import { createTracePoint, parseScenarioTrace, sampleAt } from "@/modules/sim/traces";
import { assertDistrict, buildWorldGeometry } from "@/modules/sim/world";
import { CHASE_FOV } from "@/modules/sim/vehicle";
import {
  actorInRearAwareFrame,
  captureWindowFor,
  controlPassTimeSec,
  createChaseCamPose,
  plannedChasePose,
} from "./capturePlan";

const REPO = path.resolve(__dirname, "../../../..");

/** Horizontal half-FOV of the pinned 16:9 output, rad, minus a 2° margin so
 *  "in frame" means comfortably inside, not clipped by the edge. */
const HALF_HFOV_RAD = Math.atan(Math.tan((CHASE_FOV * Math.PI) / 360) * (16 / 9));
const EDGE_MARGIN_RAD = (2 * Math.PI) / 180;
/** A sign this close to the camera is legible pixels, not a speck. */
const LEGIBLE_DIST_M = 30;

/** The pilot clips whose governing control must pass through frame, and the
 *  rendered post kind(s) that may stand for it. */
const GOVERNED_CLIPS: ReadonlyArray<readonly [string, readonly string[]]> = [
  ["sc-ov-ban-overtake__m0", ["noOvertaking"]], // В24
  ["sc-pk-ban-stop__m0", ["noStopping"]], // В27
  ["sc-rx-unguarded__m0", ["railCross", "railUnguarded", "railGuarded"]], // А35 station
  ["sc-speed-rain__m0", ["limit50"]], // В26-50 (the in-force limit — rain reps ev-speed-limit)
  ["sc-roundabout-entry__m0", ["giveWay"]], // Б1
  ["sc-junction-stop__m0", ["stop"]], // Б2
];

interface Loaded {
  plan: (typeof CLIP_PLAN)[number];
  trace: NonNullable<ReturnType<typeof parseScenarioTrace>>;
  posts: Array<{ kind: string; x: number; y: number }>;
}

const loadedCache = new Map<string, Loaded>();

function load(clipId: string): Loaded {
  let out = loadedCache.get(clipId);
  if (out) return out;
  const plan = CLIP_PLAN.find((p) => p.id === clipId);
  expect(plan, clipId).toBeDefined();
  const spec = scenarioById(plan!.templateId);
  expect(spec, clipId).toBeDefined();
  const raw: unknown = JSON.parse(
    readFileSync(path.join(REPO, "content", "world", `${spec!.map.districtId}.json`), "utf-8"),
  );
  const geometry = buildWorldGeometry(assertDistrict(raw), { parkingBays: [] });
  const posts = geometry.signs.map((s) => ({
    kind: s.kind,
    x: s.position[0],
    y: -s.position[2],
  }));
  const trace = parseScenarioTrace(
    JSON.parse(readFileSync(path.join(REPO, plan!.tracePath), "utf-8")),
  );
  expect(trace, clipId).not.toBeNull();
  out = { plan: plan!, trace: trace!, posts };
  loadedCache.set(clipId, out);
  return out;
}

/** Horizontal angle (rad) of a world point off the camera's view axis, plus
 *  its distance — pure XZ math over the planned pose. */
function angleAndDistance(
  pose: ReturnType<typeof createChaseCamPose>,
  worldX: number,
  worldZ: number,
): { angleRad: number; distM: number; inFront: boolean } {
  const vx = pose.lookX - pose.camX;
  const vz = pose.lookZ - pose.camZ;
  const vLen = Math.hypot(vx, vz);
  const dx = worldX - pose.camX;
  const dz = worldZ - pose.camZ;
  const dLen = Math.hypot(dx, dz);
  const dot = (dx * vx + dz * vz) / (dLen * vLen);
  return {
    angleRad: Math.acos(Math.max(-1, Math.min(1, dot))),
    distM: dLen,
    inFront: dot > 0,
  };
}

describe.each(GOVERNED_CLIPS)("%s — the governing control passes through frame", (clipId, kinds) => {
  it("the card's approxPos IS a rendered post of the governing kind", () => {
    const { plan, posts } = load(clipId);
    const pos = plan.governingControl.approxPos;
    expect(pos, clipId).toBeDefined();
    const match = posts.find(
      (p) =>
        kinds.includes(p.kind) &&
        Math.abs(p.x - pos!.x) < 0.01 &&
        Math.abs(p.y - pos!.y) < 0.01,
    );
    expect(match, `${clipId}: approxPos ${JSON.stringify(pos)} is not a rendered post`).toBeDefined();
  });

  it("is inside the planned camera cone at the window start (k0)", () => {
    const { plan, trace } = load(clipId);
    const pos = plan.governingControl.approxPos!;
    const passTSec = controlPassTimeSec(trace, pos, 0, plan.faultTimeSec);
    const win = captureWindowFor(trace.meta.durationSec, plan.faultTimeSec, { passTSec });
    const pt = createTracePoint();
    sampleAt(trace, win.startSec, pt);
    const pose = plannedChasePose(
      win.startSec,
      pt,
      { passTSec, x: pos.x, y: pos.y },
      createChaseCamPose(),
    );
    const { angleRad, inFront } = angleAndDistance(pose, pos.x, -pos.y);
    expect(inFront, `${clipId}: control behind the lens at k0`).toBe(true);
    expect(
      angleRad,
      `${clipId}: control ${((angleRad * 180) / Math.PI).toFixed(1)}° off-axis at k0`,
    ).toBeLessThan(HALF_HFOV_RAD - EDGE_MARGIN_RAD);
  });

  it("comes within legibility range while still in the cone (the pass-by)", () => {
    const { plan, trace } = load(clipId);
    const pos = plan.governingControl.approxPos!;
    const passTSec = controlPassTimeSec(trace, pos, 0, plan.faultTimeSec);
    const win = captureWindowFor(trace.meta.durationSec, plan.faultTimeSec, { passTSec });
    const pt = createTracePoint();
    const pose = createChaseCamPose();
    let best = Number.POSITIVE_INFINITY;
    const end = Math.min(passTSec + 0.5, win.endSec);
    for (let t = win.startSec; t <= end + 1e-6; t += 0.1) {
      sampleAt(trace, t, pt);
      plannedChasePose(t, pt, { passTSec, x: pos.x, y: pos.y }, pose);
      const { angleRad, distM, inFront } = angleAndDistance(pose, pos.x, -pos.y);
      if (inFront && angleRad < HALF_HFOV_RAD - EDGE_MARGIN_RAD && distM < best) {
        best = distM;
      }
    }
    expect(
      best,
      `${clipId}: closest in-cone approach ${best.toFixed(1)} m — the sign stays a speck`,
    ).toBeLessThanOrEqual(LEGIBLE_DIST_M);
  });
});

describe("sc-ov-oneway__m0 — the missing В1 is a declared CONTENT gap", () => {
  it("the card says СЪДЪРЖАНИЕ instead of faking a visible sign", () => {
    const { plan, posts } = load("sc-ov-oneway__m0");
    expect(posts.some((p) => p.kind === "noEntry")).toBe(false); // world truth today
    expect(plan.notes).toContain("СЪДЪРЖАНИЕ");
    expect(plan.governingControl.label).toContain("В1");
  });
});

describe("sc-vu-emergency__m0 — the rear-aware frame covers the approach (cause 2)", () => {
  it("the card switches the camera profile", () => {
    const { plan } = load("sc-vu-emergency__m0");
    expect(plan.camera).toBe("rearAware");
  });

  it("the ambulance corridor behind the ghost stays in frame over the window", () => {
    const { plan, trace } = load("sc-vu-emergency__m0");
    const win = captureWindowFor(trace.meta.durationSec, plan.faultTimeSec, null);
    // The staged EV lane: laneCenterRightM 12.19 + extraRightOffsetM −6.5
    // (templates-vru EM_APPROACH) — the pass corridor LEFT of the ghost.
    const EV_LANE_X = 12.19 - 6.5;
    const pt = createTracePoint();
    for (let t = win.startSec; t <= plan.faultTimeSec + 1e-6; t += 1) {
      sampleAt(trace, t, pt);
      for (const behindM of [12, 25, 40, 55]) {
        expect(
          actorInRearAwareFrame(pt, EV_LANE_X, pt.y - behindM),
          `t=${t.toFixed(1)} EV ${behindM} m behind out of frame`,
        ).toBe(true);
      }
    }
  });

  it("speed cards carry the dashboard strip and mw carries the lane band (cause 5)", () => {
    // sc-speed-rain__m0 is the planned ev-speed-limit clip (the founder ~72 km/h
    // rain-night blast): it cites the В26-50 in force and carries the speed strip.
    const rain = CLIP_PLAN.find((p) => p.id === "sc-speed-rain__m0")!;
    expect(rain.view).toBe("exterior+dashboard");
    expect(rain.governingControl.label).toContain("В26 (50");
    const mw = CLIP_PLAN.find((p) => p.id === "sc-mw-discipline__m0")!;
    expect(mw.laneHighlight).toBeDefined();
    expect(mw.laneHighlight!.widthM).toBeGreaterThan(3);
    // The band is the CRUISE (right) lane, not the hog lane the ghost rides.
    expect(mw.laneHighlight!.xM).toBe(0);
  });
});
