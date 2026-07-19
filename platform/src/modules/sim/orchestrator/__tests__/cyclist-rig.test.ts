/**
 * Cyclist RENDER-profile seams on the shipped runners (audit C3's render
 * half — the founder-reported „дете с колело, а отпред кара кола" bug):
 *
 *  1. CyclistRightHookRunner defaults its actor's render profile to "cyclist"
 *     at stage time (runtime only — compiled LessonSpecs stay byte-identical),
 *     so EVERY cyclistRightHook actor (hook / pass-clearance / group column /
 *     bikelane with-flow AND counter-flow / exam-bank variants) renders the
 *     bicycle rig instead of a fleet car. An authored profile wins.
 *  2. CutInLeadCarRunner forwards an authored "childCyclist" profile — the
 *     sc-vu-child-cyclist seam (the child actor is a repurposed cut-in).
 *
 * Port-level tests with a recording fake (the runner contract is "what did
 * you ask the traffic system to do") — the tram-actors.test.ts mold. Grading
 * invariance is proven by the sc-vu-* trace gates: profiles are render data.
 */

import { describe, expect, it } from "vitest";
import type { CutInLeadCarSpec, CyclistRightHookSpec } from "../../contracts";
import type {
  StagedActorSpec,
  StagedActorView,
  StagedCommand,
} from "../../traffic/types";
import { CutInLeadCarRunner, CyclistRightHookRunner } from "../runners";
import type { StagedTrafficPort } from "../types";

/** Deterministic rng stub (jitter draws don't matter at this level). */
const rng = () => 0.5;

class FakePort implements StagedTrafficPort {
  staged_: StagedActorSpec[] = [];
  commands: Array<{ id: string; command: StagedCommand }> = [];

  stage(spec: StagedActorSpec): StagedActorView | null {
    this.staged_.push(spec);
    return {
      id: spec.id,
      kind: spec.kind,
      x: 0,
      y: 0,
      dirX: 0,
      dirY: 1,
      speedMps: 0,
      s: 0,
      pathLengthM: 100,
      nodeS: [0, 50, 100],
      finished: false,
    };
  }

  stagedCommand(id: string, command: StagedCommand): void {
    this.commands.push({ id, command });
  }

  staged(): StagedActorView | null {
    return null;
  }
}

const HOOK: CyclistRightHookSpec = {
  id: "t-cyclist-hook",
  kind: "cyclistRightHook",
  junction: { nodeId: "n1", x: 0, y: 0 },
  actor: {
    pathNodes: ["a", "b", "c"],
    hold: { nodeIndex: 1, offsetM: -30 },
    cruiseSpeedMps: 3,
    extraRightOffsetM: 2.6,
    colorIndex: 1,
  },
  junctionNodeIndex: 1,
  releaseDistM: 60,
  dangerRadiusM: 9,
  conflictWindowM: 25,
};

describe("CyclistRightHookRunner — the bicycle-rig default (VU-01/02)", () => {
  it("stages a profile-less actor WITH profile 'cyclist' (the rig fix)", () => {
    const port = new FakePort();
    new CyclistRightHookRunner(HOOK).stage(port, rng, true);
    expect(port.staged_).toHaveLength(1);
    const spec = port.staged_[0];
    expect(spec.kind).toBe("vehicle");
    if (spec.kind !== "vehicle") return;
    expect(spec.profile).toBe("cyclist");
    // Everything else passes through untouched — the grading tag included.
    expect(spec.extraRightOffsetM).toBe(2.6);
    expect(spec.playerGuard).toBe(true);
  });

  it("covers the COUNTER-FLOW rider: a NEGATIVE curb offset (untagged by A11 on purpose) still renders the bicycle", () => {
    const port = new FakePort();
    const cf: CyclistRightHookSpec = {
      ...HOOK,
      actor: { ...HOOK.actor, extraRightOffsetM: -12.32 }, // sc-vbl-rider-cf's shape
    };
    new CyclistRightHookRunner(cf).stage(port, rng, true);
    const spec = port.staged_[0];
    if (spec.kind !== "vehicle") return;
    expect(spec.profile).toBe("cyclist");
  });

  it("an authored profile wins over the default", () => {
    const port = new FakePort();
    const child: CyclistRightHookSpec = {
      ...HOOK,
      actor: { ...HOOK.actor, profile: "childCyclist" },
    };
    new CyclistRightHookRunner(child).stage(port, rng, true);
    const spec = port.staged_[0];
    if (spec.kind !== "vehicle") return;
    expect(spec.profile).toBe("childCyclist");
  });
});

describe("CutInLeadCarRunner — the child-cyclist passthrough (VU-03)", () => {
  const CHILD: CutInLeadCarSpec = {
    id: "t-child-cut",
    kind: "cutInLeadCar",
    actor: {
      pathNodes: ["a", "b"],
      hold: { nodeIndex: 0, offsetM: 45 },
      cruiseSpeedMps: 2.6,
      extraRightOffsetM: 2.6, // the A11 cyclist tag (grading feed)
      profile: "childCyclist", // the render rig (sc-vucc-child's shape)
    },
    paceAheadM: 400,
    maxMatchSpeedMps: 2.6,
    cutAt: { x: 6.66, y: 100 },
    cutRadiusM: 2,
    minCutSpeedKmh: 5,
    cutShiftM: -2,
    cutRampSec: 2.5,
    cutSpeedMps: 2.6,
    clearAheadM: 400,
  };

  it("forwards the authored 'childCyclist' render profile to traffic.stage()", () => {
    const port = new FakePort();
    new CutInLeadCarRunner(CHILD).stage(port, rng, true);
    expect(port.staged_).toHaveLength(1);
    const spec = port.staged_[0];
    expect(spec.kind).toBe("vehicle");
    if (spec.kind !== "vehicle") return;
    expect(spec.profile).toBe("childCyclist");
    expect(spec.extraRightOffsetM).toBe(2.6); // the grading tag is separate
  });

  it("a profile-less cut-in stages exactly the pre-cyclist shape (profile undefined)", () => {
    const port = new FakePort();
    const plain: CutInLeadCarSpec = {
      ...CHILD,
      actor: { pathNodes: ["a", "b"], hold: { nodeIndex: 0, offsetM: 0 }, cruiseSpeedMps: 8 },
    };
    new CutInLeadCarRunner(plain).stage(port, rng, true);
    const spec = port.staged_[0];
    if (spec.kind !== "vehicle") return;
    expect(spec.profile).toBeUndefined();
  });
});
