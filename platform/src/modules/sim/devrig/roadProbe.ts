/**
 * sim/devrig/roadProbe — `window.__roadProbe`. DEV BUILDS ONLY.
 *
 * WHAT IT IS. A read-only hand-over of the ticks the product already produced,
 * for the audit harness's forward-steered leg (W59 steering spec §2.3,
 * increment 1; founder RULING-2, 2026-09-22, `docs/simulation/
 * 93_INSTRUMENT_GAPS.md`). THREE objects, kept apart on purpose (spec §2.4):
 *
 *   · `road`  — the §2.1 / §3.2 road fields, copied off each SimTick;
 *   · `route` — the product's own guidance route (`deriveGuidanceRoute`'s
 *               `DerivedRoute`, what `RouteGuidance` paints), published once per
 *               DERIVATION — at mount, on objective change and on reroute —
 *               never per tick;
 *   · `step`  — the grader's output for the same tick. ARTEFACT ONLY: a
 *               controller may read `road` and `route` and never `step`, and
 *               because it is a separate object that is a structural fact a
 *               test can assert, not a promise.
 *
 * WHAT IT IS NOT. Nothing here is computed. No smoothing, no cross-track, no
 * „in lane" boolean, no default for an absent field: an optional tick field
 * that is absent is ABSENT in the record (`opposingBank` absent is NOT
 * `false` — it is three situations, spec §2.2), and `edgeId: null` stays
 * `null`. Derivation belongs in `tools/`, where it can be tested.
 *
 * IT NEVER FEEDS BACK. The shell writes it AFTER `applyTick`; nothing in this
 * file imports the engine, the session or the locator, and the recorder never
 * mutates its inputs (pinned by a deep-freeze test). Every record is a COPY —
 * a record that held the tick's reference would publish a later tick's values
 * under an earlier `seq`.
 *
 * GATE. `process.env.NODE_ENV !== "production"`, exactly as `__camProbe`
 * (`components/sim/CameraRig.tsx`). The call sites repeat the literal gate so
 * the bundler strips the call from a production build; the functions below
 * re-check it so a production caller that slipped past still publishes
 * nothing.
 */

import type { SimTick } from "../rules";
import type { LessonStepResult } from "../lessons";

export const ROAD_PROBE_VERSION = 1;

/**
 * RING SIZE: 1024 ticks per ring (`road` and `step` alike).
 *
 * The shell ticks once per rendered frame, so this is ~17 s at 60 Hz and
 * ~8.5 s at a 120 Hz display. The harness reads it by `page.evaluate` at its
 * control rate; the slowest gap between two reads measured in the prior
 * attempt was one screenshot (225–260 ms, `path-bench.mjs`, this box), so the
 * ring outlasts that stall ~30× over and a reader that falls behind can see it
 * (a gap in `seq`) rather than lose ticks silently. It is BOUNDED because a
 * dev session can run for an hour: ~1024 small records per ring is well under
 * a megabyte, fixed, however long the drive.
 */
export const ROAD_PROBE_RING = 1024;

/** The road record — the tick's own values, nothing else. `seq` and `wallMs`
 *  are the probe's join keys (shared with the step record of the same tick);
 *  every other member is copied verbatim off the SimTick. Frame: district
 *  coordinates (x east, y north), metres — NOT the `__camProbe` (x, z = −y)
 *  frame. `headingDeg` is the product's own, 0 = north, clockwise. */
export interface RoadProbeRecord {
  seq: number;
  wallMs: number;
  t: number;
  position: { x: number; y: number };
  headingDeg: number;
  speedKmh: number;
  laneOffsetM: number;
  laneId: number;
  laneCount?: number;
  edgeId?: string | null;
  /**
   * ⚠ GATE BOTH ON `edgeId != null`. Past the kerb the product still
   * publishes `opposingBank: true` and `oneway: false` while `edgeId` is
   * `null` — 131/131 off-road ticks of sc-ov-keep-right (the steering
   * measurer, 2026-09-22) — because both are resolved off the lock ring's edge
   * and only `edgeId` is nulled by the surface consult. Recorded, not changed
   * (see `SimTick.opposingBank`): a controller that reads either without the
   * gate steers a car in a field by the bank of a road it is not on.
   */
  opposingBank?: boolean;
  oneway?: boolean;
  wrongWay?: boolean;
  /** Clamped to [0, edge length] at the edge's vertices while the tick can
   *  still name the edge there — a pinned value is „at or past this end",
   *  never a position (see `SimTick.sM`). */
  sM?: number;
  distM?: number;
  centreLinePainted?: boolean;
  laneLinesPainted?: boolean;
  worldEdgeClearanceM?: number;
  gear: number;
}

/** The grader's output for the same tick — artefact only (spec §2.4). The
 *  session's rule-engine state and lesson spec are deliberately NOT copied:
 *  they are the grader's internals, not its output, and deep-copying them 60
 *  times a second would cost more than the rest of the probe together. */
export interface RoadProbeStepRecord {
  seq: number;
  wallMs: number;
  phase: LessonStepResult["state"]["phase"];
  currentObjectiveIndex: number;
  objectives: LessonStepResult["state"]["objectives"];
  hudEvents: LessonStepResult["hudEvents"];
  teachMoments?: LessonStepResult["teachMoments"];
  mistakeMoment?: LessonStepResult["mistakeMoment"];
}

/** The shape of the route this file accepts — structurally the product's
 *  `DerivedRoute` (`scene/guidanceRoute.ts`), named here rather than imported
 *  so this module depends on no scene internals. */
export interface RoadProbeRouteSource {
  pts: ArrayLike<number>;
  arc: ArrayLike<number>;
  count: number;
  totalLen: number;
  goalS: number;
  turns: readonly { s: number; x: number; y: number; side: "left" | "right"; dirX: number; dirY: number }[];
}

/** The route as published: typed arrays become plain arrays (so it survives a
 *  `page.evaluate` round trip) — a copy, value for value, not a resampling.
 *  District frame; `pts` is flat [x0, y0, x1, y1, …]. The lane-align shift the
 *  product bakes into the final leg is IN these points (spec §3.2): the route
 *  says which way, never where in the lane. */
export interface RoadProbeRoute {
  /** 1-based count of derivations this probe has seen. */
  derivation: number;
  /** The `seq` of the last road record published before this derivation (0 =
   *  none yet) — which road records it was live for starts after this. */
  afterSeq: number;
  wallMs: number;
  pts: number[];
  arc: number[];
  count: number;
  totalLen: number;
  goalS: number;
  turns: { s: number; x: number; y: number; side: "left" | "right"; dirX: number; dirY: number }[];
}

export interface RoadProbe {
  version: number;
  ringSize: number;
  /** Last `seq` issued (monotonic across legs; a gap = records a reader missed). */
  seq: number;
  /** How many route derivations this probe has seen, including ones that
   *  returned no route. */
  routeDerivations: number;
  road: RoadProbeRecord[];
  step: RoadProbeStepRecord[];
  /** `null` until a guidance route has been derived on this page — which is
   *  the honest value for a lesson that paints no ribbon. A derivation that
   *  returned no route also publishes `null`. */
  route: RoadProbeRoute | null;
}

export function createRoadProbe(): RoadProbe {
  return {
    version: ROAD_PROBE_VERSION,
    ringSize: ROAD_PROBE_RING,
    seq: 0,
    routeDerivations: 0,
    road: [],
    step: [],
    route: null,
  };
}

/** The same gate as `__camProbe`, read at call time. */
export function roadProbeEnabled(): boolean {
  return process.env.NODE_ENV !== "production";
}

/** Pure: tick → road record. Copies named fields; an optional field absent on
 *  the tick is absent in the record (never defaulted). */
export function roadRecordOf(tick: SimTick, seq: number, wallMs: number): RoadProbeRecord {
  const r: RoadProbeRecord = {
    seq,
    wallMs,
    t: tick.t,
    position: { x: tick.position.x, y: tick.position.y },
    headingDeg: tick.headingDeg,
    speedKmh: tick.speedKmh,
    laneOffsetM: tick.laneOffsetM,
    laneId: tick.laneId,
    gear: tick.gear,
  };
  if (tick.laneCount !== undefined) r.laneCount = tick.laneCount;
  if (tick.edgeId !== undefined) r.edgeId = tick.edgeId;
  if (tick.opposingBank !== undefined) r.opposingBank = tick.opposingBank;
  if (tick.oneway !== undefined) r.oneway = tick.oneway;
  if (tick.wrongWay !== undefined) r.wrongWay = tick.wrongWay;
  if (tick.sM !== undefined) r.sM = tick.sM;
  if (tick.distM !== undefined) r.distM = tick.distM;
  if (tick.centreLinePainted !== undefined) r.centreLinePainted = tick.centreLinePainted;
  if (tick.laneLinesPainted !== undefined) r.laneLinesPainted = tick.laneLinesPainted;
  if (tick.worldEdgeClearanceM !== undefined) r.worldEdgeClearanceM = tick.worldEdgeClearanceM;
  return r;
}

/** Pure: step → step record (deep copies of the grader's output). */
export function stepRecordOf(step: LessonStepResult, seq: number, wallMs: number): RoadProbeStepRecord {
  const r: RoadProbeStepRecord = {
    seq,
    wallMs,
    phase: step.state.phase,
    currentObjectiveIndex: step.state.currentObjectiveIndex,
    objectives: structuredClone(step.state.objectives),
    hudEvents: structuredClone(step.hudEvents),
  };
  if (step.teachMoments !== undefined) r.teachMoments = structuredClone(step.teachMoments);
  if (step.mistakeMoment !== undefined) r.mistakeMoment = structuredClone(step.mistakeMoment);
  return r;
}

function pushBounded<T>(ring: T[], item: T, size: number): void {
  ring.push(item);
  while (ring.length > size) ring.shift();
}

/** Append one tick's road + step records (same `seq`) to a probe. */
export function recordRoadProbeTick(
  probe: RoadProbe,
  tick: SimTick,
  step: LessonStepResult,
  wallMs: number,
): void {
  const seq = probe.seq + 1;
  probe.seq = seq;
  pushBounded(probe.road, roadRecordOf(tick, seq, wallMs), probe.ringSize);
  pushBounded(probe.step, stepRecordOf(step, seq, wallMs), probe.ringSize);
}

/** Replace the probe's route with a copy of this derivation (or `null`). */
export function recordRoadProbeRoute(
  probe: RoadProbe,
  route: RoadProbeRouteSource | null,
  wallMs: number,
): void {
  const derivation = probe.routeDerivations + 1;
  probe.routeDerivations = derivation;
  probe.route =
    route === null
      ? null
      : {
          derivation,
          afterSeq: probe.seq,
          wallMs,
          pts: Array.from(route.pts),
          arc: Array.from(route.arc),
          count: route.count,
          totalLen: route.totalLen,
          goalS: route.goalS,
          turns: route.turns.map((t) => ({ s: t.s, x: t.x, y: t.y, side: t.side, dirX: t.dirX, dirY: t.dirY })),
        };
}

/** Where the probe lives. `window` in the browser; any object in a test. */
export interface RoadProbeHost {
  __roadProbe?: RoadProbe;
}

function hostProbe(host: RoadProbeHost): RoadProbe {
  if (host.__roadProbe === undefined) host.__roadProbe = createRoadProbe();
  return host.__roadProbe;
}

function nowMs(): number {
  return typeof performance !== "undefined" ? performance.now() : Date.now();
}

/** The shell's tap: publish one tick onto `host.__roadProbe`. No-op in
 *  production. Returns nothing and reads nothing back. */
export function publishRoadProbeTick(
  host: RoadProbeHost | undefined,
  tick: SimTick,
  step: LessonStepResult,
  wallMs: number = nowMs(),
): void {
  if (!roadProbeEnabled() || host === undefined) return;
  recordRoadProbeTick(hostProbe(host), tick, step, wallMs);
}

/** RouteGuidance's tap: publish one derivation onto `host.__roadProbe`. */
export function publishRoadProbeRoute(
  host: RoadProbeHost | undefined,
  route: RoadProbeRouteSource | null,
  wallMs: number = nowMs(),
): void {
  if (!roadProbeEnabled() || host === undefined) return;
  recordRoadProbeRoute(hostProbe(host), route, wallMs);
}
