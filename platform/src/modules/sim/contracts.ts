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

/**
 * PERCEPTUAL ROAD SCALE — the single dial for how exaggerated the road
 * network is versus textbook Bulgarian dimensions (founder call 2026-07-10:
 * perception over textbook; tunable). Driving games run 1.5–2.5× lane
 * exaggeration because textbook-width lanes read miniature on screen; we run
 * 2.5×. The CAR stays real-size — only the road world scales. EVERY road
 * dimension (lane width, paint, setbacks, grading tolerances, traffic-AI
 * offsets) must derive from this constant so one edit re-tunes the world
 * coherently — visual geometry, grading geometry, traffic AI and paint have
 * to agree or detectors misfire.
 */
export const PERCEPTUAL_ROAD_SCALE = 2.5;

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
  sample(
    v: VehicleSample,
    tSec: number,
    isNight: boolean,
    rain?: boolean,
    leadGapM?: number,
  ): SimTick;
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
  /**
   * Vehicle state at spawn (A1 driveline). Default (absent) = "cold": engine
   * OFF, selector P, parking brake ON — the pre-drive reality every lesson
   * should start from. "ready" = engine running in D with the brake released;
   * reserved for acclimatization free-drive (L0).
   */
  vehicleStart?: "cold" | "ready";
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
  /** A graded mistake. Carries the catalog's authored WHY (explanationBg) +
   * law citation — the toast must teach at the moment of the error (QW7). */
  | { kind: "violation"; titleBg: string; explanationBg: string; points: number; severity: "opasna" | "osnovna" | "vtorostepenna"; lawRef?: string }
  | { kind: "commendation"; titleBg: string }
  /** A first, teachable encounter — coached, not scored (teach-first-then-grade). */
  | { kind: "lesson"; titleBg: string; explanationBg: string; lawRef?: string }
  | { kind: "objectiveComplete"; titleBg: string }
  | { kind: "quiz"; questionId: string };
