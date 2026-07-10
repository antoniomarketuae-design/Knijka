/**
 * Performed pre-drive (A2, doc 68 Pillar 1) — the vocabulary that connects
 * REAL vehicle-state transitions to procedure steps.
 *
 * The A4/A5/A7 root cause was two unconnected state machines: the checklist
 * said "done" while the car disagreed. A2 inverts the arrow — the procedure
 * machine (machine.ts) no longer completes steps from clicks; the 3D scene
 * observes the car (driveline.subscribe + cabin state polls + glance events
 * + raw pedals) and feeds each observed transition through
 * `observeControlSignal`, which resolves it to the step it performs. The
 * pure machine then scores order/skips exactly as before.
 *
 * STEP CLASSIFICATION
 *  - "performed": has a real control behind it — completes ONLY via that
 *    control (keyboard or cockpit hotspot; both drive the same
 *    CabinControls/DrivelineState, so they are indistinguishable here).
 *  - "info": walkaround-style observational steps with no underlying system
 *    yet (seat rig → A3, dashboard read-back → later). These remain
 *    confirm-by-click in the read-only checklist, visually marked
 *    „информационна стъпка".
 *
 * MIRROR STEPS (the graded glance path, doc 69): a mirror hotspot click and
 * the Q/E/F keys both fire a cabin glance. While `adjust-mirrors` is not yet
 * performed, glances accumulate — all three mirrors glanced = the mirrors
 * step (you cannot set mirrors you never looked at). Afterwards any single
 * glance performs `final-mirror-check`. The machine's validate() still
 * scores glancing at the wrong time (e.g. final check before the engine).
 *
 * MOVE-OFF: pressing the throttle IS the move-off action — but only once the
 * driveline can genuinely pull away (`readyToMoveOff`); an earlier throttle
 * press stays the QW10 "завърши подготовката" teaching moment. Completing
 * the procedure is what unlocks the QW10 drive gate, so the same press that
 * finishes the checklist rolls the car.
 *
 * Pure TS, no DOM/three — unit-tested in performedSteps.test.ts. The tracker
 * is deliberately a tiny MUTABLE frame-glue accumulator (scene-side), NOT
 * graded state: all scoring truth stays in the pure machine.
 */

import type { DrivelineEvent, DrivelinePhysicsInput } from "../vehicle";
import type { MirrorKind } from "../rules/types";
import type { PreDriveStepId } from "./types";

// ---------------------------------------------------------------------------
// Cockpit hotspot contract (doc 69 — names are LOAD-BEARING)
// ---------------------------------------------------------------------------

/** The exact node names the cockpit interior must expose (doc 69). The
 *  raycaster resolves `object.name`, walking up parents until a match. */
export type CockpitHotspotName =
  | "hotspot_engine_start"
  | "hotspot_belt"
  | "hotspot_gear_selector"
  | "hotspot_parking_brake"
  | "hotspot_indicator_stalk"
  | "hotspot_wiper_stalk"
  | "hotspot_headlights"
  | "hotspot_hazard"
  | "hotspot_horn"
  | "hotspot_mirror_left"
  | "hotspot_mirror_right"
  | "hotspot_mirror_rear"
  | "hotspot_fog";

export const COCKPIT_HOTSPOT_NAMES: readonly CockpitHotspotName[] = [
  "hotspot_engine_start",
  "hotspot_belt",
  "hotspot_gear_selector",
  "hotspot_parking_brake",
  "hotspot_indicator_stalk",
  "hotspot_wiper_stalk",
  "hotspot_headlights",
  "hotspot_hazard",
  "hotspot_horn",
  "hotspot_mirror_left",
  "hotspot_mirror_right",
  "hotspot_mirror_rear",
  "hotspot_fog",
];

const HOTSPOT_NAME_SET: ReadonlySet<string> = new Set(COCKPIT_HOTSPOT_NAMES);

export function isCockpitHotspotName(name: string): name is CockpitHotspotName {
  return HOTSPOT_NAME_SET.has(name);
}

/** Minimal structural node — matches three.js Object3D without importing it. */
export interface NamedNode {
  name: string;
  parent: NamedNode | null;
}

/**
 * Doc-69 resolution rule: walk `object.name` up the parent chain until a
 * `hotspot_*` contract name matches; anything else in the cockpit is inert.
 * (The procedural cockpit binds handlers per mesh, so this mostly guards the
 * A3 authored-interior future where hotspot proxies may carry child meshes.)
 */
export function resolveHotspotName(node: NamedNode | null): CockpitHotspotName | null {
  for (let n = node; n !== null; n = n.parent) {
    if (isCockpitHotspotName(n.name)) return n.name;
  }
  return null;
}

// ---------------------------------------------------------------------------
// Step classification + control metadata
// ---------------------------------------------------------------------------

export type PreDriveStepKind = "performed" | "info";

/** Observational steps with no real control yet — confirm-by-click. */
export const PRE_DRIVE_INFO_STEPS: readonly PreDriveStepId[] = [
  "adjust-seat", // seat rig lands with the authored interior (A3)
  "check-surroundings", // walkaround — purely observational
  "check-dashboard", // telltale read-back quiz is post-A2
];

export function preDriveStepKind(stepId: PreDriveStepId): PreDriveStepKind {
  return PRE_DRIVE_INFO_STEPS.includes(stepId) ? "info" : "performed";
}

export interface PreDriveStepControl {
  /** Keyboard hint shown in instruction mode (the keys are REAL — honesty
   *  rule: a hint may only promise a control that works). */
  keys: string;
  /** Cockpit hotspots that perform the step (instruction-mode highlight). */
  hotspots: readonly CockpitHotspotName[];
}

/** Control metadata for every PERFORMED step (info steps have no entry). */
export const PRE_DRIVE_STEP_CONTROLS: Partial<Record<PreDriveStepId, PreDriveStepControl>> = {
  "adjust-mirrors": {
    keys: "Q E F",
    hotspots: ["hotspot_mirror_left", "hotspot_mirror_right", "hotspot_mirror_rear"],
  },
  "fasten-seatbelt": { keys: "B", hotspots: ["hotspot_belt"] },
  "headlights-on": { keys: "L", hotspots: ["hotspot_headlights"] },
  "start-engine": { keys: "I", hotspots: ["hotspot_engine_start"] },
  "press-brake": { keys: "S", hotspots: [] }, // pedal — no cockpit hotspot
  "select-gear": { keys: "]", hotspots: ["hotspot_gear_selector"] },
  "release-handbrake": { keys: "Space", hotspots: ["hotspot_parking_brake"] },
  "final-mirror-check": {
    keys: "Q E F",
    hotspots: ["hotspot_mirror_left", "hotspot_mirror_right", "hotspot_mirror_rear"],
  },
  signal: { keys: ",", hotspots: ["hotspot_indicator_stalk"] },
  "move-off": { keys: "W", hotspots: [] }, // the throttle pedal itself
};

/** Hotspots to highlight for a step in instruction mode ([] for info steps). */
export function hotspotsForStep(stepId: PreDriveStepId): readonly CockpitHotspotName[] {
  return PRE_DRIVE_STEP_CONTROLS[stepId]?.hotspots ?? [];
}

// ---------------------------------------------------------------------------
// Control signals (what the scene observes) → performed steps
// ---------------------------------------------------------------------------

/**
 * One observed vehicle-control transition. The scene builds these from:
 *  - `driveline.subscribe` events (ignition / selector / parking brake),
 *  - cabin state POLLS, edge-detected per frame (belt / lights / indicator),
 *  - the cabin glance callback (keys Q/E/F and mirror hotspot clicks),
 *  - raw (pre-gate) pedal values on the input (brake press, move-off).
 */
export type PreDriveControlSignal =
  | { kind: "driveline"; event: DrivelineEvent }
  | { kind: "seatbelt"; on: boolean }
  | { kind: "headlights"; setting: "off" | "low" | "high" }
  | { kind: "indicator"; setting: "off" | "left" | "right" }
  | { kind: "glance"; mirror: MirrorKind }
  | { kind: "brakePressed" }
  /** Throttle pressed while `readyToMoveOff` — the caller checks readiness. */
  | { kind: "moveOffAttempt" };

/**
 * Frame-glue accumulator: which steps this tracker already resolved (the
 * machine is idempotent anyway — this only disambiguates the mirror steps
 * and keeps the signal stream quiet), plus the mirror-coverage set.
 * Reset it whenever a fresh procedure run starts (lesson start / retry).
 */
export interface PreDriveSignalTracker {
  emitted: Set<PreDriveStepId>;
  mirrorsGlanced: Set<MirrorKind>;
}

export function createPreDriveSignalTracker(): PreDriveSignalTracker {
  return { emitted: new Set(), mirrorsGlanced: new Set() };
}

/**
 * True when the driveline can genuinely pull away FORWARD — the condition
 * under which a throttle press means „потегляне" rather than a blocked-drive
 * teaching moment. Clutch state is deliberately ignored (a manual move-off
 * holds the clutch down at the moment of first throttle).
 */
export function readyToMoveOff(d: DrivelinePhysicsInput): boolean {
  return d.engineOn && (d.selector === "D" || d.selector === "M") && !d.parkingBrakeOn;
}

/**
 * Resolve one observed control signal to the pre-drive step it performs, or
 * null when it performs none (repeats, irrelevant transitions, partial
 * mirror coverage). Mutates the tracker (frame-glue, not graded state).
 */
export function observeControlSignal(
  tracker: PreDriveSignalTracker,
  signal: PreDriveControlSignal,
): PreDriveStepId | null {
  const emit = (stepId: PreDriveStepId): PreDriveStepId | null => {
    if (tracker.emitted.has(stepId)) return null;
    tracker.emitted.add(stepId);
    return stepId;
  };

  switch (signal.kind) {
    case "driveline": {
      const e = signal.event;
      if (e.kind === "engineStarted") return emit("start-engine");
      if (e.kind === "selectorChanged" && (e.selector === "D" || e.selector === "M")) {
        return emit("select-gear"); // a forward drive gear, deliberately engaged
      }
      if (e.kind === "parkingBrakeChanged" && !e.on) return emit("release-handbrake");
      return null;
    }
    case "seatbelt":
      return signal.on ? emit("fasten-seatbelt") : null;
    case "headlights":
      return signal.setting !== "off" ? emit("headlights-on") : null;
    case "indicator":
      // The move-off step is explicitly the LEFT indicator (pulling out from
      // the right curb) — a right signal completes nothing.
      return signal.setting === "left" ? emit("signal") : null;
    case "glance": {
      if (!tracker.emitted.has("adjust-mirrors")) {
        tracker.mirrorsGlanced.add(signal.mirror);
        return tracker.mirrorsGlanced.size === 3 ? emit("adjust-mirrors") : null;
      }
      return emit("final-mirror-check");
    }
    case "brakePressed":
      return emit("press-brake");
    case "moveOffAttempt":
      return emit("move-off");
  }
}
