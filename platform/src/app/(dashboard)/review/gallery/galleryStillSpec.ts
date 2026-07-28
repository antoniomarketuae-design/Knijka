/**
 * galleryStillSpec — PURE derivation: one scenario template → the
 * `SceneStillMedia` that /dev/scene-still renders as its review still.
 *
 * Why this exists. The founder cannot finish the verdict board because it
 * lists 150 scenario templates and shows him nothing to judge. A full reel is
 * minutes of render each (hours for the set); a scene-still is well under a
 * second. So every template gets ONE deterministic 3/4 overhead frame of its
 * REAL committed district with the learner's car placed where the recorded
 * shadow drive actually is mid-drill — enough to rule on "is this the right
 * road, the right layout, the right approach?" without rendering a reel.
 *
 * No I/O, no fs, no three: the caller resolves the district spawn point and
 * the shadow-trace samples and hands them in. That keeps the derivation
 * testable and lets BOTH consumers share it — the gallery page (server) and
 * the /dev/gallery-index feed the offline build script reads.
 *
 * Positions are district-space metres, x east / y north, headingDeg 0 = north
 * clockwise (the sim trace convention SceneStillMedia already speaks).
 */

import type { SceneStillMedia, SceneStillPose } from "@/lib/content/types";

/** The only trace fields a still needs (a `sim/traces` sample, narrowed). */
export interface StillTraceSample {
  tSec: number;
  x: number;
  y: number;
  headingDeg: number;
}

/** A district spawn point, as committed in content/world/<id>.json. */
export interface StillSpawnPoint {
  id: string;
  x: number;
  y: number;
  heading: number;
}

/**
 * A parking bay from the district's own `meta.scenario` block.
 *
 * A parking drill IS its neighbours: the reference frame is the two cars the
 * learner reverses between. Framing only the ego on the aisle produced an
 * empty strip of tarmac for the whole parking family — reviewable as nothing.
 * The district already states which bays are occupied and which one is the
 * target, so the still can place real cars and point at the slot without any
 * engine, any traffic system, or any authored duplicate of that data.
 */
export interface StillParkingBay {
  x: number;
  y: number;
  headingDeg: number;
  occupied: boolean;
  isTarget: boolean;
}

/** Everything the derivation needs about one template (already resolved). */
export interface ScenarioStillInput {
  templateId: string;
  districtId: string;
  /** ScenarioSpec.map.archetype — drives the focus window size. */
  archetype: string;
  /** ScenarioSpec.start, flattened. */
  start: {
    spawnPointId?: string;
    position?: { x: number; y: number };
    headingDeg?: number;
  };
  /** The district's spawn points (for a `spawnPointId` start). */
  spawnPoints?: readonly StillSpawnPoint[];
  /** The district's parking bays, when it has any (`meta.scenario.bays`). */
  parkingBays?: readonly StillParkingBay[];
  /** The recorded shadow drive, if the trace file exists and is not pending. */
  shadowSamples?: readonly StillTraceSample[] | null;
  /**
   * `tSec` of the shadow trace's ANNOTATION events — the instructor beats the
   * recording itself marks („Свободното място е вдясно…"). The best frame of a
   * drill is the moment it is teaching about, and the trace already says where
   * that is, so nothing here has to guess.
   */
  shadowAnnotationsSec?: readonly number[] | null;
}

/**
 * How wide a window (metres) each map archetype needs to read as a diagram.
 * A parking bay is a 30 m story; a motorway merge is an 80 m one. Framing them
 * identically makes half the set unreadable, which is the whole failure mode
 * this gallery exists to fix.
 */
const ZOOM_BY_ARCHETYPE: Record<string, number> = {
  "parking-lot": 34,
  "zebra-block": 42,
  "narrow-street": 44,
  "t-junction": 48,
  "x-junction": 52,
  "s-curve-street": 58,
  "straight-street": 58,
  "hill-ramp": 58,
  roundabout: 60,
  "rural-curve": 66,
  "merge-lane": 72,
  "motorway-segment": 86,
};

/** Fallback window for an archetype the table does not know. */
export const DEFAULT_STILL_ZOOM_M = 56;

/**
 * Where along the shadow drive to freeze when the trace carries no usable
 * annotation. Not the start (an empty approach road tells you nothing) and not
 * the end (the maneuver is already over) — just before the middle.
 */
export const SHADOW_SAMPLE_FRACTION = 0.45;

/** An annotation this close to t=0 is the drill's opening line, not a beat. */
const ANNOTATION_MIN_SEC = 0.5;

/**
 * How far ahead of the car to centre the frame, as a fraction of the window.
 * Pushing the focus forward buys road the learner is driving INTO instead of
 * road already behind them.
 */
const LOOK_AHEAD_FRACTION = 0.18;

/** Padding around the ego↔target-bay span, and the ceiling on that widening. */
const BAY_SPAN_PAD = 1.8;
const BAY_MAX_ZOOM_M = 70;

export function stillZoomFor(archetype: string): number {
  return ZOOM_BY_ARCHETYPE[archetype] ?? DEFAULT_STILL_ZOOM_M;
}

/**
 * Which recorded sample the still freezes on.
 *
 * A drill's own shadow trace annotates its teaching beats, and the MIDDLE beat
 * is reliably the situation the drill is about (the parking template's third
 * annotation is the reverse itself; the fog template's is the reduced-speed
 * run). Falling back to a fixed fraction of the drive would frame half the
 * catalogue on an empty approach road — which is exactly the "shows him
 * nothing to judge" failure this gallery exists to fix.
 *
 * Exported for the test, which pins both branches.
 */
export function shadowSampleIndex(
  samples: readonly StillTraceSample[],
  annotationsSec: readonly number[] | null,
): number {
  const last = samples.length - 1;
  const endSec = samples[last]?.tSec ?? 0;
  const beats = (annotationsSec ?? [])
    .filter((t) => Number.isFinite(t) && t >= ANNOTATION_MIN_SEC && t < endSec)
    .sort((a, b) => a - b);

  if (beats.length > 0) {
    const target = beats[Math.floor((beats.length - 1) / 2)];
    let best = 0;
    let bestGap = Infinity;
    for (let i = 0; i <= last; i++) {
      const gap = Math.abs(samples[i].tSec - target);
      if (gap < bestGap) {
        bestGap = gap;
        best = i;
      }
    }
    return best;
  }

  return Math.min(last, Math.max(0, Math.round(last * SHADOW_SAMPLE_FRACTION)));
}

/** headingDeg (0 = north, clockwise) → unit vector in district space. */
function forward(headingDeg: number): { x: number; y: number } {
  const r = (headingDeg * Math.PI) / 180;
  return { x: Math.sin(r), y: Math.cos(r) };
}

/** Why a template's ego pose could not be resolved (the honest gap list). */
export type StillGapReason = "no-pose";

export interface ScenarioStillResult {
  spec: SceneStillMedia | null;
  /** How the ego pose was resolved — surfaced in the gallery as provenance. */
  source: "shadow-trace" | "start-position" | "spawn-point" | null;
  gap: StillGapReason | null;
}

/**
 * Resolve the learner's pose for the still, in descending order of honesty:
 *
 *  1. the recorded shadow drive (what the drill ACTUALLY looks like),
 *  2. the template's explicit `start.position`,
 *  3. the district spawn point the template names.
 *
 * Every template that reaches none of the three is reported as a gap rather
 * than rendered from a guess — a made-up frame is worse than a missing one on
 * a surface whose entire job is a founder verdict.
 */
export function scenarioStillSpec(input: ScenarioStillInput): ScenarioStillResult {
  const zoomM = stillZoomFor(input.archetype);

  let pose: { x: number; y: number; headingDeg: number } | null = null;
  let source: ScenarioStillResult["source"] = null;

  const samples = input.shadowSamples;
  if (samples && samples.length > 0) {
    const s = samples[shadowSampleIndex(samples, input.shadowAnnotationsSec ?? null)];
    pose = { x: s.x, y: s.y, headingDeg: s.headingDeg };
    source = "shadow-trace";
  } else if (input.start.position) {
    pose = {
      x: input.start.position.x,
      y: input.start.position.y,
      headingDeg: input.start.headingDeg ?? 0,
    };
    source = "start-position";
  } else if (input.start.spawnPointId && input.spawnPoints) {
    const sp = input.spawnPoints.find((p) => p.id === input.start.spawnPointId);
    if (sp) {
      pose = { x: sp.x, y: sp.y, headingDeg: input.start.headingDeg ?? sp.heading };
      source = "spawn-point";
    }
  }

  if (!pose) return { spec: null, source: null, gap: "no-pose" };

  const ego: SceneStillPose = {
    kind: "car",
    x: round2(pose.x),
    y: round2(pose.y),
    headingDeg: round2(pose.headingDeg),
    variant: "ego",
  };

  // The neighbours that DEFINE a parking drill (see StillParkingBay).
  const bays = input.parkingBays ?? [];
  const neighbours: SceneStillPose[] = bays
    .filter((b) => b.occupied)
    .map((b) => ({
      kind: "car" as const,
      x: round2(b.x),
      y: round2(b.y),
      headingDeg: round2(b.headingDeg),
    }));
  const target = bays.find((b) => b.isTarget) ?? null;

  // Framing. Normally: a little ahead of the car, so the frame buys road the
  // learner is driving INTO. With a target bay: the span between the two, wide
  // enough that both the car and the slot it must reach are on screen.
  let focusX: number;
  let focusY: number;
  let focusZoom = zoomM;
  if (target) {
    focusX = (pose.x + target.x) / 2;
    focusY = (pose.y + target.y) / 2;
    const span = Math.hypot(target.x - pose.x, target.y - pose.y);
    focusZoom = Math.min(BAY_MAX_ZOOM_M, Math.max(zoomM, span * BAY_SPAN_PAD));
  } else {
    const f = forward(pose.headingDeg);
    const ahead = zoomM * LOOK_AHEAD_FRACTION;
    focusX = pose.x + f.x * ahead;
    focusY = pose.y + f.y * ahead;
  }

  return {
    spec: {
      kind: "sceneStill",
      districtId: input.districtId,
      focus: { x: round2(focusX), y: round2(focusY), zoomM: round2(focusZoom) },
      poses: [ego, ...neighbours],
      ...(target ? { marks: [{ kind: "target" as const, x: round2(target.x), y: round2(target.y) }] } : {}),
    },
    source,
    gap: null,
  };
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

/** Stable file/key name for a template's gallery still. */
export function stillKeyForScenario(templateId: string): string {
  return `sc__${templateId}`;
}

/** Stable file/key name for a question's gallery still. */
export function stillKeyForQuestion(questionId: string): string {
  return `q__${questionId}`;
}
