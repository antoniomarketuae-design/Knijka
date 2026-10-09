/**
 * ═══════════════════════════════════════════════════════════════════════════
 * NO FRAME OF THE CRASH RESPONSE SHOWS THE INSIDE OF A BODY —
 * `sc-hz-brake-dont-swerve:f0023997` (major), clauses 1 and 6, as measured by
 * the rig-w2 judge at 43b4109 on the PC blind-swerve drive (60 fps strip):
 * c079–c081 and c095–c098, the play area a flat orange-brown field with two
 * seat backs at its foot — the cockpit eye inside the drawn exterior shell —
 * and before them chase frames with the student's car drawn as an open cabin.
 *
 * `bodyViewCut.ts` carries the mechanism (the pose is a ref read every frame,
 * the body swap is React state committed frames later). This file walks the
 * crash frame by frame through the REAL `ImpactCut` rules, with the body swap
 * landing a configurable number of rendered frames after the view was asked
 * for, and checks every frame against the student's own body box.
 *
 * WHAT IT CANNOT SHOW: pixels. It proves the ORDER — the pose this rig writes
 * against the visibility flags three.js will draw — not what a GPU paints, and
 * the body box is the chassis collider widened to the documented 1.4 m body,
 * not the GLB's own triangles. The integrator re-photographs the swerve
 * through /dev/drive-rig for that.
 * ═══════════════════════════════════════════════════════════════════════════
 */

import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { Group } from "three";
import { describe, expect, it } from "vitest";

import { impactCutGivesBack, impactCutView } from "@/components/sim/ImpactCut";
import {
  CHASE_DISTANCE,
  CHASE_HEIGHT,
  CHASSIS_HALF_EXTENTS,
  COCKPIT_EYE,
} from "../vehicle/tuning";
import {
  CABIN_SHELL_NODE,
  EXTERIOR_BODY_NODE,
  cameraPoseMode,
  readDrawnBodies,
  type BodyCutView,
  type DrawnBodies,
} from "./bodyViewCut";

// ── The student's own body, chassis-local (+X left, +Y up, +Z forward) ──────
// Width and length: the collider the exterior GLB is auto-fitted to
// (`HeroCarBody` scales the model to the collider width). Height: the road
// sits 1.20 m below the cockpit eye (tuning.ts, COCKPIT_EYE: „1.20 m above
// road") and the body is ~1.4 m tall (tuning.ts, the chase-rig block).
const ROAD_Y = COCKPIT_EYE.y - 1.2;
const BODY = {
  x: CHASSIS_HALF_EXTENTS.x,
  z: CHASSIS_HALF_EXTENTS.z,
  yLo: ROAD_Y,
  yHi: ROAD_Y + 1.4,
};
type V3 = { x: number; y: number; z: number };
const insideBody = (p: V3) =>
  Math.abs(p.x) < BODY.x && Math.abs(p.z) < BODY.z && p.y > BODY.yLo && p.y < BODY.yHi;

/** Where `CameraRig` puts the eye for a pose, chassis-local, on the frame it
 *  switches (`switched ⇒ k = 1`, a snap). Chase afterwards trails BEHIND this
 *  point by v / CHASE_STIFFNESS and closes on it from behind, never through it. */
function eyeFor(pose: BodyCutView): V3 {
  if (pose === "cockpit") return { x: COCKPIT_EYE.x, y: COCKPIT_EYE.y, z: COCKPIT_EYE.z };
  if (pose === "chase") return { x: 0, y: CHASE_HEIGHT, z: -CHASE_DISTANCE };
  return { x: 0, y: 110, z: 0 }; // TOPDOWN_HEIGHT_M, straight above
}

describe("the body box is the one the defect is about", () => {
  it("the cockpit eye is INSIDE the exterior shell — so the shell must never be drawn around it", () => {
    expect(insideBody(eyeFor("cockpit"))).toBe(true);
  });
  it("the chase and top-down eyes are outside it", () => {
    expect(insideBody(eyeFor("chase"))).toBe(false);
    expect(insideBody(eyeFor("topdown"))).toBe(false);
  });
});

// ── The frame walk ───────────────────────────────────────────────────────────

interface Drive {
  name: string;
  /** Graded contacts, ms after the first, with the closing speed. */
  impacts: { atMs: number; kmh: number }[];
  /** Car speed at this time (ms after the first contact), km/h. */
  speedAt(ms: number): number;
}

/** The PC blind swerve (pc-L3-swerve60): first contact at 49.64 км/ч, a second
 *  12 frames (200 ms) later (the chase burst c086 after c074), the car still at
 *  47–48 км/ч on c098, then the scripted full-force stop. */
const SWERVE: Drive = {
  name: "swerve",
  impacts: [
    { atMs: 0, kmh: 49.64 },
    { atMs: 200, kmh: 48 },
  ],
  speedAt: (ms) => (ms < 450 ? 48 : Math.max(0, 48 - 0.0324 * (ms - 450))),
};
/** The PC no-brake drive (pc-L3-late60): 49.61 → −3.7 км/ч in one tick. */
const LATE: Drive = {
  name: "late",
  impacts: [{ atMs: 0, kmh: 49.61 }],
  speedAt: () => 0,
};

type PoseRule = (requested: BodyCutView, drawn: DrawnBodies, lastPose: BodyCutView | null) => BodyCutView;
/** What CameraRig did at base: the camera stood wherever the ref said. */
const BASE_RULE: PoseRule = (requested) => requested;
const REPAIRED_RULE: PoseRule = (requested, drawn, lastPose) => cameraPoseMode(requested, drawn, lastPose);

interface Frame {
  f: number;
  ms: number;
  requested: BodyCutView;
  drawn: DrawnBodies;
  pose: BodyCutView;
}

/**
 * One crash, frame by frame. Inside a frame, in R3F's order: anything that
 * happened since the last frame (physics contacts → `ImpactCut.impact`, the
 * 200 ms release poll) has already written `cameraModeRef`; the bodies show
 * the view as it was `commitLagFrames` frames ago (React renders the newest
 * state when its scheduled commit runs); then the rig poses the camera.
 */
function walk(
  drive: Drive,
  rule: PoseRule,
  frameMs: number,
  commitLagFrames: number,
  pollPhaseMs: number,
): Frame[] {
  let requested: BodyCutView = "cockpit";
  let restoreTo: BodyCutView | null = null;
  const history: BodyCutView[] = [];
  const frames: Frame[] = [];
  let lastPose: BodyCutView | null = "cockpit";
  // The ImpactCut component's two paths, with its pure rules.
  const onImpact = (kmh: number) => {
    const next = impactCutView(requested, kmh, restoreTo !== null, false);
    if (next === null) return;
    restoreTo = requested;
    requested = next;
  };
  const onPoll = (ms: number) => {
    if (restoreTo === null) return;
    if (requested !== "chase") {
      restoreTo = null;
      return;
    }
    if (!impactCutGivesBack(requested, drive.speedAt(ms))) return;
    requested = restoreTo;
    restoreTo = null;
  };
  // Events, in time order: contacts and poll ticks over a 2 s window, plus
  // the lag itself so the last swap always lands inside the walk.
  const START = -200;
  const END = 2000 + commitLagFrames * frameMs;
  const events: { ms: number; run: () => void }[] = [];
  for (const i of drive.impacts) events.push({ ms: i.atMs, run: () => onImpact(i.kmh) });
  for (let t = START + pollPhaseMs; t < END; t += 200) {
    const at = t;
    events.push({ ms: at, run: () => onPoll(at) });
  }
  events.sort((a, b) => a.ms - b.ms);
  let e = 0;
  for (let f = 0; START + f * frameMs < END; f++) {
    const ms = START + f * frameMs;
    while (e < events.length && events[e].ms <= ms) events[e++].run();
    history.push(requested);
    const shownView = f - commitLagFrames >= 0 ? history[f - commitLagFrames] : "cockpit";
    const cockpitDrawn = shownView === "cockpit";
    const drawn: DrawnBodies = { exterior: !cockpitDrawn, cabin: cockpitDrawn };
    const pose = rule(requested, drawn, lastPose);
    frames.push({ f, ms, requested, drawn, pose });
    lastPose = pose;
  }
  return frames;
}

/** Frames where the camera is inside a drawn exterior, or an outside view
 *  draws the open cabin shell. */
function badFrames(frames: Frame[]): Frame[] {
  return frames.filter(
    (fr) =>
      (fr.drawn.exterior && insideBody(eyeFor(fr.pose))) ||
      (fr.pose !== "cockpit" && fr.drawn.cabin),
  );
}

const CADENCES = [
  { name: "PC 60 fps", frameMs: 1000 / 60 },
  // The phone strips render about 9 frames a second (judge, clause 3).
  { name: "phone ~9 fps", frameMs: 1000 / 9 },
] as const;
/** Rendered frames between the view being asked for and the bodies swapping.
 *  The judge measured ~5 (c074 → c079) and ~20 (c048 → c052…, no-brake). */
const LAGS = [1, 2, 5, 12, 20] as const;
const PHASES = Array.from({ length: 20 }, (_, i) => i * 10);

describe("the walk can see the defect — the base rule fails it", () => {
  it("at base (camera = the requested view) the swerve puts the eye inside the drawn shell", () => {
    const frames = walk(SWERVE, BASE_RULE, 1000 / 60, 5, 30);
    const bad = badFrames(frames);
    expect(bad.length).toBeGreaterThan(0);
    // Both halves of the filed picture are reproduced, not just one.
    expect(bad.some((fr) => fr.pose === "cockpit" && fr.drawn.exterior)).toBe(true);
    expect(bad.some((fr) => fr.pose === "chase" && fr.drawn.cabin)).toBe(true);
  });
});

describe("with the repair, no frame of the crash shows the inside of a body", () => {
  for (const drive of [SWERVE, LATE]) {
    for (const cad of CADENCES) {
      it(`${drive.name}, ${cad.name}: every lag, every poll phase — zero bad frames`, () => {
        const offenders: string[] = [];
        for (const lag of LAGS) {
          for (const phase of PHASES) {
            const bad = badFrames(walk(drive, REPAIRED_RULE, cad.frameMs, lag, phase));
            if (bad.length > 0) {
              const b = bad[0];
              offenders.push(
                `lag ${lag} phase ${phase}: frame ${b.f} (+${b.ms.toFixed(0)} ms) pose ${b.pose} with ` +
                  `${b.drawn.exterior ? "exterior" : "cabin"} drawn`,
              );
            }
          }
        }
        expect(offenders).toEqual([]);
      });
    }
  }

  it("the camera moves on the FIRST frame the bodies agree — the hold is never longer than the swap", () => {
    for (const drive of [SWERVE, LATE]) {
      for (const cad of CADENCES) {
        for (const lag of LAGS) {
          for (const phase of PHASES) {
            for (const fr of walk(drive, REPAIRED_RULE, cad.frameMs, lag, phase)) {
              const fits =
                fr.requested === "cockpit" ? !fr.drawn.exterior : !fr.drawn.cabin;
              if (fits) expect(fr.pose).toBe(fr.requested);
            }
          }
        }
      }
    }
  });

  it("the crash response is still shown: on the no-brake drive the chase view stands, exterior drawn", () => {
    for (const cad of CADENCES) {
      for (const lag of LAGS) {
        const frames = walk(LATE, REPAIRED_RULE, cad.frameMs, lag, 0);
        const last = frames[frames.length - 1];
        expect(last.pose).toBe("chase");
        expect(last.drawn).toEqual({ exterior: true, cabin: false });
        // …and it arrives on the very frame the exterior is first drawn.
        const firstChase = frames.findIndex((fr) => fr.pose === "chase");
        const firstExterior = frames.findIndex((fr) => fr.drawn.exterior);
        expect(firstChase).toBe(firstExterior);
      }
    }
  });

  it("with no lag at all the repair changes nothing: pose = request on every frame", () => {
    // Lag 0 is the ideal commit (bodies already match the ref).
    for (const drive of [SWERVE, LATE]) {
      for (const fr of walk(drive, REPAIRED_RULE, 1000 / 60, 0, 30)) {
        expect(fr.pose).toBe(fr.requested);
      }
    }
  });
});

describe("cameraPoseMode — the rule, case by case", () => {
  const EXT: DrawnBodies = { exterior: true, cabin: false };
  const CAB: DrawnBodies = { exterior: false, cabin: true };

  it("unknown bodies keep the request (a scene without the hero car is unchanged)", () => {
    expect(cameraPoseMode("cockpit", null, "chase")).toBe("cockpit");
    expect(cameraPoseMode("chase", null, "cockpit")).toBe("chase");
  });
  it("cut to chase before the exterior is drawn: hold the cockpit", () => {
    expect(cameraPoseMode("chase", CAB, "cockpit")).toBe("cockpit");
    expect(cameraPoseMode("topdown", CAB, "cockpit")).toBe("cockpit");
  });
  it("hand back to the cockpit before the cabin is drawn: hold the outside view", () => {
    expect(cameraPoseMode("cockpit", EXT, "chase")).toBe("chase");
    expect(cameraPoseMode("cockpit", EXT, "topdown")).toBe("topdown");
  });
  it("a request that has not landed, from a pose that no longer fits, goes to the view the bodies fit", () => {
    // Ref went cockpit → chase → cockpit before either commit: the camera
    // never left the cockpit, and now the chase commit has drawn the exterior.
    expect(cameraPoseMode("cockpit", EXT, "cockpit")).toBe("chase");
    expect(cameraPoseMode("chase", CAB, "chase")).toBe("cockpit");
  });
  it("matching bodies: the request, whatever the last pose", () => {
    expect(cameraPoseMode("chase", EXT, "cockpit")).toBe("chase");
    expect(cameraPoseMode("cockpit", CAB, "chase")).toBe("cockpit");
    expect(cameraPoseMode("topdown", EXT, "chase")).toBe("topdown");
  });
});

describe("readDrawnBodies reads the scene graph three.js will draw", () => {
  function chassisWithBodies() {
    const chassis = new Group();
    const exterior = new Group();
    exterior.name = EXTERIOR_BODY_NODE;
    const cabin = new Group();
    cabin.name = CABIN_SHELL_NODE;
    chassis.add(exterior, cabin);
    return { chassis, exterior, cabin };
  }

  it("reports each group's own visible flag", () => {
    const { chassis, exterior, cabin } = chassisWithBodies();
    const cache = { exterior: null, cabin: null };
    exterior.visible = false;
    cabin.visible = true;
    expect(readDrawnBodies(chassis, cache)).toEqual({ exterior: false, cabin: true });
    exterior.visible = true;
    cabin.visible = false;
    expect(readDrawnBodies(chassis, cache)).toEqual({ exterior: true, cabin: false });
  });

  it("an invisible group between the body and the chassis hides it too", () => {
    const chassis = new Group();
    const wrapper = new Group();
    const exterior = new Group();
    exterior.name = EXTERIOR_BODY_NODE;
    const cabin = new Group();
    cabin.name = CABIN_SHELL_NODE;
    wrapper.add(exterior);
    chassis.add(wrapper, cabin);
    wrapper.visible = false;
    expect(readDrawnBodies(chassis, { exterior: null, cabin: null })).toEqual({
      exterior: false,
      cabin: true,
    });
  });

  it("is null while a body is not mounted, and finds a remounted one", () => {
    const { chassis, exterior } = chassisWithBodies();
    const cache = { exterior: null, cabin: null };
    // Resolved once (the cache now holds this node)…
    exterior.visible = true;
    expect(readDrawnBodies(chassis, cache)).toEqual({ exterior: true, cabin: true });
    // …then unmounted: the stale node must not keep answering.
    chassis.remove(exterior);
    expect(readDrawnBodies(chassis, cache)).toBeNull();
    const again = new Group();
    again.name = EXTERIOR_BODY_NODE;
    again.visible = false;
    chassis.add(again);
    expect(readDrawnBodies(chassis, cache)).toEqual({ exterior: false, cabin: true });
    expect(readDrawnBodies(null, cache)).toBeNull();
  });
});

// ── The wiring: a predicate nothing reads is not a repair ───────────────────
const SIM = resolve(__dirname, "../../../components/sim");
const read = (p: string) => readFileSync(resolve(SIM, p), "utf8");

describe("the product reads it", () => {
  it("HeroCarBody's top group is the named exterior, with the cockpit-flag visibility on the SAME element", () => {
    expect(read("HeroCarBody.tsx")).toMatch(
      /<group name=\{EXTERIOR_BODY_NODE\} visible=\{!cockpitView\}>/,
    );
  });
  it("VitokCockpit's top group is the named cabin shell, likewise", () => {
    expect(read("vitok/VitokCockpit.tsx")).toMatch(
      /<group name=\{CABIN_SHELL_NODE\} visible=\{cockpitView\}>/,
    );
  });
  it("both bodies hang under the chassis group CameraRig reads", () => {
    expect(read("VehicleRig.tsx")).toMatch(
      /<group ref=\{chassisGroupRef\}>\s*<HeroCarBody[^>]*\/>\s*<VitokCockpit/,
    );
  });
  it("CameraRig poses the camera from cameraPoseMode over the drawn bodies, not from the bare ref", () => {
    const rig = read("CameraRig.tsx");
    expect(rig).toMatch(
      /const mode = cameraPoseMode\(\s*cameraModeRef\.current \?\? "chase",\s*readDrawnBodies\(chassis, bodyNodesRef\.current\),\s*lastMode\.current,\s*\);/,
    );
    // The base line — the pose straight off the ref — is gone.
    expect(rig).not.toMatch(/const mode = cameraModeRef\.current \?\? "chase";/);
  });
});
