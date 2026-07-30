/**
 * captureFeedParity — the pilot-v2 CAUSE-1/CAUSE-4 evidence, locked as tests.
 *
 * Replays the committed mistake traces through the EXACT stack the capture
 * rig mounts — createCaptureFeedStepper (the SHARED ghost-as-player feed,
 * the same code CaptureScene runs) over the recorder-parity world build —
 * and pins, per R0-failed pilot clip:
 *
 *  CAUSE 1 (actors): the ghost feed ARMS and MOVES every staged actor
 *  exactly as the recording did — the sc-lane-change pace car, the
 *  sc-roundabout-entry circulator, the sc-ed-d2-city-run walker (which the
 *  authored red-run trace NEVER releases — that is the recording's truth,
 *  not a feed failure). What R0 saw as "absent" is a FRAMING truth, and the
 *  honest checklist now says so: presence = in the planned frame during the
 *  fault beat, so the rig flags „⚠ ЛИПСВА" exactly where the founder did.
 *
 *  CAUSE 4 (lamps): the ghost-facing lamp state is trace-true — RED at the
 *  d2 red-run's engine fault time on the map's natural offsets, and the
 *  recording-authored pins (captureSignalDials) reproduce the recorded lamp
 *  clock for the dialed templates (sc-signal-redyellow's [19,20) red+yellow
 *  window), which the natural clock does NOT.
 */

import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { CLIP_PLAN, type ClipPlanEntry } from "@/modules/clips";
// Node-only test seam (see the file's header): these clips are R0 EVIDENCE
// about specific recordings, so they must not evaporate when the why-panel
// re-points an event and the derived pilot list drops them.
import { buildClipPlan } from "@/modules/clips/clipPlanBuilder";
import { lessonDistrictId } from "@/modules/sim/contracts";
import {
  compileScenario,
  scenarioById,
  scenarioEntryLevel,
  type LessonSpec,
} from "@/modules/sim/lessons";
import { createScenarioDirector, type ScenarioDirector } from "@/modules/sim/orchestrator";
import { createWorldRuntime } from "@/modules/sim/runtime";
import { createTrafficSystem, type TrafficDistrict, type TrafficSystem } from "@/modules/sim/traffic";
import {
  createTracePoint,
  parseScenarioTrace,
  sampleAt,
  type ScenarioTrace,
} from "@/modules/sim/traces";
import {
  buildActorChecklist,
  captureWindowFor,
  cabinChannelsFor,
  controlPassTimeSec,
  createActorPresenceLog,
  type ActorPresenceLog,
} from "./capturePlan";
import { createCaptureFeedStepper, type CaptureFeedStepper } from "./captureGhostFeed";
import { recordedSignalOffsetsFor } from "./captureSignalDials";
import type { RecordingWindow } from "./trim";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(HERE, "../../../../..");

function loadJson(rel: string): unknown {
  return JSON.parse(readFileSync(path.join(REPO_ROOT, rel), "utf-8"));
}

interface CaptureStack {
  plan: ClipPlanEntry;
  lesson: LessonSpec;
  trace: ScenarioTrace;
  runtime: ReturnType<typeof createWorldRuntime>;
  traffic: TrafficSystem;
  director: ScenarioDirector | null;
  stepper: CaptureFeedStepper;
  window: RecordingWindow;
  log: ActorPresenceLog;
}

/** The capture rig's world build, headless — mirrors CaptureScene's effect
 *  (recorder parity: seed 7, zero ambient, lesson signal modes + the
 *  recording's signal pins, the seven traffic queries) and the client's
 *  window derivation (loadRun). */
/**
 * The clip's requirements card. Normally that is its committed CLIP_PLAN row;
 * for a clip the pilot list no longer names (its event was re-pointed at
 * another reel) the SAME builder derives the card on demand from the same
 * committed trace + template + district. Either way the card is machine-
 * derived — never a fixture, so the R0 pins below cannot drift from the
 * production derivation.
 */
function planFor(clipId: string): ClipPlanEntry {
  const committed = CLIP_PLAN.find((p) => p.id === clipId);
  if (committed) return committed;
  const parsed = /^(.+)__m(\d+)$/.exec(clipId);
  if (!parsed) throw new Error(`malformed clip id ${clipId}`);
  const [, templateId, indexRaw] = parsed;
  const mistakeIndex = Number(indexRaw);
  const spec = scenarioById(templateId);
  const mistake = spec?.mistakes[mistakeIndex];
  if (!mistake) throw new Error(`no mistake ${mistakeIndex} on ${templateId}`);
  const [entry] = buildClipPlan([
    { id: clipId, templateId, mistakeIndex, tracePath: mistake.traceRef.path },
  ]);
  return entry;
}

function buildCaptureStack(clipId: string): CaptureStack {
  const plan = planFor(clipId);
  const spec = scenarioById(plan.templateId);
  if (!spec) throw new Error(`no template ${plan.templateId}`);
  const lesson = compileScenario(spec, scenarioEntryLevel(spec));
  const raw = loadJson(path.join("content", "world", `${lessonDistrictId(lesson)}.json`));
  const trace = parseScenarioTrace(loadJson(plan.tracePath));
  if (!trace) throw new Error(`bad trace ${plan.tracePath}`);

  const runtime = createWorldRuntime(raw);
  for (const [nodeId, mode] of Object.entries(lesson.signalModes ?? {}).sort((a, b) =>
    a[0] < b[0] ? -1 : 1,
  )) {
    runtime.setSignalClusterMode(nodeId, mode);
  }
  const dials = recordedSignalOffsetsFor(plan.templateId, plan.tracePath);
  for (const [nodeId, offsetSec] of Object.entries(dials ?? {}).sort((a, b) =>
    a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : 0,
  )) {
    runtime.setSignalClusterOffset(nodeId, offsetSec);
  }
  const traffic = createTrafficSystem(raw as TrafficDistrict, {
    seed: 7,
    vehicleCount: 0,
    pedestrianCount: 0,
  });
  runtime.setPedestrianQuery((id) => traffic.pedestrianOnCrossing(id));
  runtime.setJunctionConflictQuery((x, y, r, b) => traffic.conflictNear(x, y, r, b));
  runtime.setOncomingQuery((px, py, h, r) => traffic.oncomingNear(px, py, h, r));
  runtime.setRightConflictQuery((jx, jy, px, py, h, r) =>
    traffic.conflictFromRight(jx, jy, px, py, h, r),
  );
  runtime.setCirculatingQuery((cx, cy, px, py, h, r) =>
    traffic.circulatingConflict(cx, cy, px, py, h, r),
  );
  runtime.setCyclistQuery((px, py, h, r) => traffic.cyclistNear(px, py, h, r));
  runtime.setOvertakenQuery((px, py, h, r) => traffic.overtakenNear(px, py, h, r));

  // KNOWN DIVERGENCE, left deliberately (ledger T17 surfaced it; it is not this
  // lane's to close). The capture CLIENT re-enacts a clip against
  // `clipStagedOverrideFor` when the demo was recorded on a demo-only rig
  // (clip-capture-client.tsx:266); this harness stages the compiled DRILL rig
  // instead. The two used to agree by coincidence. Wiring the override in here
  // was tried and it flips `sc-roundabout-entry__m1`'s checklist from
  // present:false to present:true — an R0 EVIDENCE assertion owned by the
  // roundabout family — so the harness keeps the drill rig and the divergence is
  // recorded rather than papered over.
  const stagedEvents = lesson.stagedEvents ?? [];
  const director =
    stagedEvents.length > 0
      ? createScenarioDirector(stagedEvents, traffic, { seed: 7, signals: runtime })
      : null;

  const control = plan.governingControl;
  const hasPositionedControl = control.kind !== "none" && control.approxPos !== undefined;
  const passTSec = hasPositionedControl
    ? controlPassTimeSec(trace, control.approxPos!, 0, plan.faultTimeSec)
    : null;
  const window = captureWindowFor(
    trace.meta.durationSec,
    plan.faultTimeSec,
    passTSec !== null ? { passTSec } : null,
  );

  const isNight = (lesson.environment?.timeOfDay ?? "day") === "night";
  const mistake = spec.mistakes[plan.mistakeIndex];
  const log = createActorPresenceLog();
  const stepper = createCaptureFeedStepper({
    runtime,
    traffic,
    director,
    trace,
    cabin: cabinChannelsFor(mistake.codeRefs, isNight),
    env: {
      night: isNight,
      rain: lesson.environment?.rain ?? false,
      fog: lesson.environment?.fog ?? false,
      snow: lesson.environment?.snow ?? false,
    },
    obstacleVehicles: [],
    windowStartSec: window.startSec,
    faultTimeSec: plan.faultTimeSec,
    getLog: () => log,
  });
  return { plan, lesson, trace, runtime, traffic, director, stepper, window, log };
}

interface ActorTrack {
  id: string;
  firstMoveSec: number | null;
  distToGhostAtFault: number;
  movedM: number;
}

interface WalkResult {
  stack: CaptureStack;
  tracks: Map<string, ActorTrack>;
  /** director phase snapshots "id:phase" at each transition, with times. */
  resolutions: Map<string, number>; // event id -> tSec its runner resolved
}

/** Pre-roll + playback exactly like the rig (one shared stepper), probing
 *  actor state every 0.1 s. */
function walkCapture(clipId: string, probe?: (t: number, s: CaptureStack) => void): WalkResult {
  const stack = buildCaptureStack(clipId);
  const { stepper, traffic, director, trace, plan } = stack;
  const staged = stack.lesson.stagedEvents ?? [];
  const pt = createTracePoint();
  const hold = new Map(staged.map((ev) => {
    const view = traffic.staged(ev.id);
    return [ev.id, { x: view?.x ?? NaN, y: view?.y ?? NaN }] as const;
  }));
  const tracks = new Map<string, ActorTrack>(
    staged.map((ev) => [
      ev.id,
      { id: ev.id, firstMoveSec: null, distToGhostAtFault: NaN, movedM: 0 },
    ]),
  );
  const resolutions = new Map<string, number>();
  const end = stack.window.endSec;
  for (let t = 0.1; t <= end + 1e-9; t += 0.1) {
    const target = Math.min(t, end);
    stepper.advanceTo(target);
    sampleAt(trace, target, pt);
    for (const ev of staged) {
      const view = traffic.staged(ev.id);
      const track = tracks.get(ev.id)!;
      if (!view) continue;
      const h = hold.get(ev.id)!;
      const moved = Math.hypot(view.x - h.x, view.y - h.y);
      if (moved > track.movedM) track.movedM = moved;
      if (track.firstMoveSec === null && moved > 0.5) track.firstMoveSec = target;
      if (Number.isNaN(track.distToGhostAtFault) && target >= plan.faultTimeSec) {
        track.distToGhostAtFault = Math.hypot(view.x - pt.x, view.y - pt.y);
      }
    }
    if (director) {
      for (const s of director.snapshot()) {
        if (s.phase === "resolved" && !resolutions.has(s.id)) resolutions.set(s.id, target);
      }
    }
    probe?.(target, stack);
  }
  return { stack, tracks, resolutions };
}

function checklistFor(walk: WalkResult) {
  return buildActorChecklist(walk.stack.plan.requiredActors, walk.stack.log);
}

// ---------------------------------------------------------------------------
// The PASS reference — the feed and the honest checklist agree with R0
// ---------------------------------------------------------------------------

describe("sc-follow-distance__m0 (R0 PASS reference)", () => {
  const walk = walkCapture("sc-follow-distance__m0");

  it("the lead car arms on the ghost's movement and paces ahead at the fault", () => {
    const lead = walk.tracks.get("sc-fd-lead")!;
    expect(lead.firstMoveSec).not.toBeNull();
    expect(lead.firstMoveSec!).toBeLessThan(4);
    // RE-BASELINED for ledger T17 (doc 86 §2), measured 29.89 m (was ~13).
    // The drill's lead is no longer a matchPlayer rubber band pinned 13 m ahead
    // — it is a scheduled cruise handed over 33 m ahead at 7.2 m/s, which is
    // what lets a live student open the gap by lifting off. This harness stages
    // that DRILL rig (see the divergence note in buildCaptureStack); the shipped
    // clip re-enacts the 5.75 m demo rig instead, so the frame the founder
    // reviews is unchanged. The band still proves the thing it exists to prove:
    // the lead ARMED, MOVED, and is ahead of the ghost at the fault rather than
    // parked at its hold pose 45 m up the road.
    expect(lead.distToGhostAtFault).toBeGreaterThan(4);
    expect(lead.distToGhostAtFault).toBeLessThan(35);
  });

  it("the honest checklist marks the lead PRESENT (in frame at the beat)", () => {
    expect(checklistFor(walk)).toEqual([
      expect.objectContaining({ kind: "vehicle", present: true }),
    ]);
  });
});

// ---------------------------------------------------------------------------
// CAUSE 1 — the R0-failed clips: the feed re-enacts, the frame does not show
// ---------------------------------------------------------------------------

describe("sc-lane-change__m0 (R0 FAIL: 'target-lane car absent')", () => {
  const walk = walkCapture("sc-lane-change__m0");

  it("the pace car DOES arm and pace in the ghost feed (not a feed failure)", () => {
    const car = walk.tracks.get("sc-lc-blindspot")!;
    expect(car.firstMoveSec).not.toBeNull();
    expect(car.firstMoveSec!).toBeLessThan(8);
    expect(car.movedM).toBeGreaterThan(80); // paced the corridor, not dormant
    // The blind-spot position: BEHIND the ghost, well within staging range.
    expect(car.distToGhostAtFault).toBeLessThan(60);
  });

  it("the honest checklist now agrees with the founder: NOT in frame", () => {
    // followGapM −24 puts the actor behind the chase camera for the whole
    // beat — presence must read false (the v2 manifest said true — the lie).
    expect(checklistFor(walk)).toEqual([
      expect.objectContaining({ kind: "vehicle", present: false }),
    ]);
  });
});

describe("sc-roundabout-entry__m0 (R0 FAIL: 'circulating car absent')", () => {
  const walk = walkCapture("sc-roundabout-entry__m0");

  it("the circulator syncs and the recorded conviction re-enacts on time", () => {
    const car = walk.tracks.get("sc-rb-circulating")!;
    expect(car.firstMoveSec).not.toBeNull();
    expect(car.firstMoveSec!).toBeLessThan(9);
    // The runner resolves (the barge's FAILED_TO_YIELD beat) at the engine
    // fault time the PLAN recorded — recording/capture parity.
    const resolved = walk.resolutions.get("sc-rb-circulating");
    expect(resolved).toBeDefined();
    expect(Math.abs(resolved! - walk.stack.plan.faultTimeSec)).toBeLessThan(0.6);
  });

  it("the honest checklist agrees with the founder: outside the planned frame", () => {
    // At the fault the circulator is ~22 m to the WSW — past the frustum's
    // left edge (the half-cropped blue car in k2).
    expect(checklistFor(walk)).toEqual([
      expect.objectContaining({ kind: "vehicle", present: false }),
    ]);
  });
});

describe("sc-roundabout-entry__m1 (R0 FAIL: 'circulating car absent')", () => {
  const walk = walkCapture("sc-roundabout-entry__m1");

  it("the circulator circulates through the whole exit demo", () => {
    const car = walk.tracks.get("sc-rb-circulating")!;
    expect(car.firstMoveSec).not.toBeNull();
    expect(car.movedM).toBeGreaterThan(20);
    // Trails close behind the ghost at the exit fault — present in world.
    expect(car.distToGhostAtFault).toBeLessThan(20);
  });

  it("the honest checklist reports what the chase frame shows", () => {
    // The ghost circulates FASTER and exits ahead — the car is behind the
    // camera at the exit beat.
    expect(checklistFor(walk)).toEqual([
      expect.objectContaining({ kind: "vehicle", present: false }),
    ]);
  });
});

describe("sc-ed-d2-city-run__m0 (R0 FAIL: 'pedestrian absent' + 'green during red-run')", () => {
  const lampAtFault: string[] = [];
  const lampInWindow = new Set<string>();
  const walk = walkCapture("sc-ed-d2-city-run__m0", (t, s) => {
    if (t < s.window.startSec) return;
    const pt = createTracePoint();
    sampleAt(s.trace, t, pt);
    const lamp = String(s.runtime.signalLampState("n152073034", pt.headingDeg));
    lampInWindow.add(lamp);
    if (Math.abs(t - s.plan.faultTimeSec) < 0.06) lampAtFault.push(lamp);
  });

  it("the walker never releases — the AUTHORED truth of the red-run trace", () => {
    // scEdD2CityRun.ts: the red-light demo ends past the junction and never
    // reaches the zebra's release zone, BY DESIGN. The staged walker holding
    // 500+ m away is recording truth, not an arming failure.
    const ped = walk.tracks.get("sc-edcr-ped")!;
    expect(ped.firstMoveSec).toBeNull();
    expect(ped.distToGhostAtFault).toBeGreaterThan(400);
  });

  it("the honest checklist flags the required-actor mismatch loudly", () => {
    // The PLAN card requires the walker for m0 — a card bug the rig can now
    // SEE: the row must read absent, never a silent present:true.
    expect(checklistFor(walk)).toEqual([
      expect.objectContaining({ kind: "pedestrian", present: false }),
    ]);
  });

  it("CAUSE 4: the ghost-facing lamp is RED at the engine fault time", () => {
    expect(lampAtFault.length).toBeGreaterThan(0);
    for (const lamp of lampAtFault) expect(lamp).toBe("red");
  });

  it("CAUSE 4: the ghost-facing lamp is NEVER green inside the window", () => {
    expect(lampInWindow.has("green")).toBe(false);
    expect(lampInWindow.has("red")).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// CAUSE 4 — the recording-authored signal pins (captureSignalDials)
// ---------------------------------------------------------------------------

describe("captureSignalDials — the recording's lamp clock, re-applied", () => {
  it("resolves the scJunctions per-trace pins (shadow pinned, amber gamble natural)", () => {
    expect(
      recordedSignalOffsetsFor(
        "sc-signal-response",
        "content/traces/sc-signal-response/shadow-correct.trace.json",
      ),
    ).toEqual({ "sx-n-c": 23 });
    expect(
      recordedSignalOffsetsFor(
        "sc-signal-response",
        "content/traces/sc-signal-response/mistake-amber-gamble.trace.json",
      ),
    ).toBeNull();
    expect(
      recordedSignalOffsetsFor(
        "sc-rx-tram-left",
        "content/traces/sc-rx-tram-left/mistake-cut-tram.trace.json",
      ),
    ).toEqual({ "sx-n-c": 18.5 });
  });

  it("natural-offset recordings resolve to null — apply NOTHING", () => {
    expect(
      recordedSignalOffsetsFor(
        "sc-ed-d2-city-run",
        "content/traces/sc-ed-d2-city-run/mistake-red-light.trace.json",
      ),
    ).toBeNull();
    expect(
      recordedSignalOffsetsFor(
        "sc-follow-distance",
        "content/traces/sc-follow-distance/mistake-tailgate.trace.json",
      ),
    ).toBeNull();
  });

  it("sc-signal-redyellow: the pinned clock shows the recorded red+yellow window; the natural clock does not", () => {
    const raw = loadJson(path.join("content", "world", "sx-v1.json"));
    // WITH the recording's pin (offset 30): ns red+yellow on t ∈ [19,20),
    // green from t = 20 — the scripted „изстрелване" beat.
    const pinned = createWorldRuntime(raw);
    const dials = recordedSignalOffsetsFor(
      "sc-signal-redyellow",
      "content/traces/sc-signal-redyellow/mistake-jump.trace.json",
    );
    expect(dials).toEqual({ "sx-n-c": 30 });
    for (const [nodeId, offsetSec] of Object.entries(dials!)) {
      pinned.setSignalClusterOffset(nodeId, offsetSec);
    }
    pinned.update(19.5);
    expect(String(pinned.signalLampState("sx-n-c", 0))).toBe("redYellow");
    pinned.update(5.5); // t = 25 — clean green
    expect(String(pinned.signalLampState("sx-n-c", 0))).toBe("green");
    // WITHOUT the pin the same instant shows a different lamp (natural
    // offset 1 → yellow) — exactly the CAUSE-4 divergence class.
    const natural = createWorldRuntime(raw);
    natural.update(19.5);
    expect(String(natural.signalLampState("sx-n-c", 0))).not.toBe("redYellow");
  });
});
