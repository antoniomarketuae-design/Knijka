/**
 * P5 integration contracts — the seams between the sim's parallel workstreams.
 * Owned by the integrator (main session). Implementations live in:
 *   world/     — district geometry + visual world (renders district-v1.json)
 *   runtime/   — logic layer: signals, zones, lane tracking, SimTick emission
 *   lessons/   — lesson specs, objectives, session orchestration
 *   traffic/   — scripted traffic agents
 *   environment/ — sky, lighting, weather, time-of-day, quality presets
 *
 * The rule engine's SimTick/SimTickEvent (rules/types.ts) is the *authoritative*
 * frame contract — runtime produces it, nothing else redefines it.
 */

import type { SimTick } from "./rules/types";

/** Vehicle state sampled from the physics rig each frame (world space, meters). */
export interface VehicleSample {
  position: { x: number; y: number }; // ground plane; x=east, y=north (district space)
  headingDeg: number; // 0 = north, clockwise positive
  speedKmh: number;
  indicator: "off" | "left" | "right";
  headlights: "off" | "low" | "high";
  seatbeltOn: boolean;
  handbrakeOn: boolean;
  gear: number;
  mirrorGlance: "left" | "right" | "rear" | null; // set on the frame a glance key is pressed
}

/** Traffic-signal runtime state, per signal node id from district-v1.json. */
export type SignalPhase = "red" | "redYellow" | "green" | "yellow";

export interface WorldRuntime {
  /** Advance signal phases etc.; call once per render frame. */
  update(dtSec: number): void;
  /** Produce the authoritative SimTick for the rule engine from a vehicle sample. */
  sample(v: VehicleSample, tSec: number, isNight: boolean): SimTick;
  /** Current phase for a signal node (world renderer reads this to light the lamps). */
  signalPhase(signalNodeId: string): SignalPhase;
  /** Resolved speed limit at a position (edge maxspeed or BG urban default 50). */
  speedLimitAt(pos: { x: number; y: number }): number;
  /** Nearest drivable edge + lane info (for HUD/minimap and lane tracking). */
  locate(pos: { x: number; y: number }): {
    edgeId: string | null;
    laneId: number;
    laneOffsetM: number;
  };
}

/** A scored driving lesson. Specs are data; orchestration lives in lessons/. */
export interface LessonSpec {
  id: string; // "l-first-drive"
  order: number;
  titleBg: string;
  descriptionBg: string;
  /** Concept ids this lesson exercises (links sim ↔ knowledge graph). */
  conceptIds: string[];
  /** Spawn point id from district-v1.json, or explicit pose. */
  spawn: { pointId?: string; position?: { x: number; y: number }; headingDeg?: number };
  /** Whether the 13-step pre-drive procedure runs before driving. */
  preDrive: boolean;
  /** Ordered objectives; each completes via a predicate over runtime state. */
  objectives: LessonObjective[];
  /** Optional time-of-day/weather override. */
  environment?: { timeOfDay?: "day" | "dusk" | "night"; rain?: boolean };
}

export interface LessonObjective {
  id: string;
  titleBg: string; // shown in the objective banner
  /** Reach a zone, maintain behavior, or pass a checkpoint — kinds the
   * lessons engine implements; keep this union in sync there. */
  kind: "reachZone" | "passSignal" | "completeManeuver" | "driveDistance";
  params: Record<string, unknown>;
}

/** Events the HUD listens to (toasts, banners). Emitted by lessons/runtime. */
export type HudEvent =
  | { kind: "violation"; titleBg: string; points: number; severity: "opasna" | "osnovna" | "vtorostepenna"; lawRef?: string }
  | { kind: "commendation"; titleBg: string }
  | { kind: "objectiveComplete"; titleBg: string }
  | { kind: "quiz"; questionId: string };
