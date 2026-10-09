/**
 * CONTACT AT THE PHYSICS SUB-STEP — sc-roundabout-entry:7b747c15, part 2.
 *
 * The director's ContactSentinel was already SWEPT (collision/probe.ts, sweep
 * 161 part F): it never sampled a single frame instant. But it swept the
 * CHORD between the two frame poses, and a staged car does not drive a
 * chord — it follows its path. On a long frame the chord cuts every bend:
 * at 0.5 s a car on a 10 m radius sweeps 80° of arc and its chord runs 2.3 m
 * inside the arc at the middle. So a long frame could
 *
 *   · INVENT a contact — a student parked inside the bend, clear of the car's
 *     real path by 0.3 m, is crossed by the chord; and
 *   · HIDE one — a student standing on the outside of the bend, overlapping
 *     the car's real path, is never reached by the chord.
 *
 * Since this lane the director runs the sentinel at every staged sub-step
 * too, against the pose the actor actually has there, so the sweep follows
 * the path one physics step at a time. This file pins that with a port whose
 * car runs an exact circle and whose `update(dt)` keeps the TrafficSystem's
 * sub-step contract (traffic/system.ts: ≤ 1/60 s steps, the listener called
 * between them, `frameEnd` after) — so every distance below is the test's own
 * arithmetic, not an inference from a district.
 *
 * Both cases are checked three ways: the 60 Hz truth, the long frame with the
 * sub-step contract (must match the truth), and the long frame WITHOUT it —
 * the behaviour a frame-only director had, which is the bug, asserted to
 * really differ so the geometry is known to bite.
 */

import { describe, expect, it } from "vitest";
import { actorObb, obbSeparationM, playerObb } from "../../collision";
import type { BrakingLeadCarSpec } from "../../contracts";
import type {
  StagedActorSpec,
  StagedActorView,
  StagedCommand,
  StagedSubstepListener,
  StagedSubstepPlayer,
} from "../../traffic/types";
import { createScenarioDirector } from "../director";
import type { StagedTrafficPort } from "../types";

/** Circle the staged car drives (CCW about the origin), m. */
const R = 10;
/** Its speed, m/s: 80° of arc in one 0.5 s frame. */
const V = (R * (80 * Math.PI)) / 180 / 0.5;
/** The physics step the TrafficSystem integrates staged actors in. */
const STEP = 1 / 60;

/** A car whose whole contact cast is one body with closing = the player's speed (> 2 км/ч). */
const SPEC: BrakingLeadCarSpec = {
  id: "t-rbcad-arc-car",
  kind: "brakingLeadCar",
  actor: { pathNodes: ["a", "b"], hold: { nodeIndex: 0, offsetM: 0 }, cruiseSpeedMps: 0, colorIndex: 1 },
  followGapM: 20,
  maxMatchSpeedMps: 12,
  slamAt: { x: 500, y: 500 },
  slamRadiusM: 1,
  slamDecelMps2: 6,
  minSlamSpeedKmh: 5,
  proximityFallbackM: 0.5,
  triggersHazard: false,
  resumeAfterSec: 999,
};

/** The car's pose at session time t: centred on angle 0 at t = T_MID. */
const T_MID = 1.0;
function carAt(t: number): { x: number; y: number; dirX: number; dirY: number } {
  const th = (V / R) * (t - T_MID);
  return { x: R * Math.cos(th), y: R * Math.sin(th), dirX: -Math.sin(th), dirY: Math.cos(th) };
}

/** A port whose car runs the exact circle, with the TrafficSystem's sub-step contract — or without it. */
class ArcPort implements StagedTrafficPort {
  private listener: StagedSubstepListener | null = null;
  private t = 0;
  readonly view = {
    id: SPEC.id,
    kind: "vehicle",
    x: 0,
    y: 0,
    dirX: 0,
    dirY: 1,
    speedMps: V,
    s: 0,
    pathLengthM: 1000,
    nodeS: [0, 1000],
    finished: false,
  } as unknown as StagedActorView;
  private readonly player: StagedSubstepPlayer = { x: 0, y: 0, speedKmh: 0, headingDeg: 0 };

  constructor(private readonly substeps: boolean) {
    this.place(0);
  }
  private place(t: number): void {
    const c = carAt(t);
    const v = this.view as unknown as { x: number; y: number; dirX: number; dirY: number };
    v.x = c.x;
    v.y = c.y;
    v.dirX = c.dirX;
    v.dirY = c.dirY;
  }
  stage(_spec: StagedActorSpec): StagedActorView | null {
    return this.view;
  }
  stagedCommand(_id: string, _command: StagedCommand): void {}
  staged(_id: string): StagedActorView | null {
    return this.view;
  }
  setStagedSubstepListener(listener: StagedSubstepListener | null): void {
    if (this.substeps) this.listener = listener;
  }
  /** One frame of `dt`; the student stands at (px, py) the whole time. */
  update(dt: number, px: number, py: number, kmh: number): void {
    const n = Math.max(1, Math.ceil(dt / STEP - 1e-9));
    const h = dt / n;
    for (let j = 0; j < n; j++) {
      if (j > 0 && this.listener) {
        this.player.x = px;
        this.player.y = py;
        this.player.speedKmh = kmh;
        this.player.headingDeg = 0;
        this.listener.substep(j * h, h, dt, this.player);
      }
      this.t += h;
      this.place(this.t);
    }
    this.listener?.frameEnd();
  }
}

/** Drive frames of `dt` from t = 0 to 2 s; return the session times a collision was billed. */
function run(dt: number, substeps: boolean, px: number, py: number): number[] {
  const port = new ArcPort(substeps);
  const director = createScenarioDirector([SPEC], port, { seed: 1 });
  const kmh = 5; // over the cast's 2 км/ч closing floor; he barely moves
  const hits: number[] = [];
  let t = 0;
  // Frame zero (dt 0): the director's first look, as every live loop opens.
  director.step({ tSec: 0, dtSec: 0, x: px, y: py, speedKmh: kmh, headingDeg: 0, brakePedal: 0, tickEvents: [] });
  // The frame grid is offset so the long frame's two ends are ±40° about the
  // bend's middle: (T_MID − 0.25, T_MID + 0.25).
  const first = dt >= 0.5 ? T_MID - 0.25 : dt;
  const frames: number[] = [first];
  while (frames[frames.length - 1] + dt <= 2 + 1e-9) frames.push(frames[frames.length - 1] + dt);
  for (const tEnd of frames) {
    const d = tEnd - t;
    port.update(d, px, py, kmh);
    t = tEnd;
    const res = director.step({ tSec: t, dtSec: d, x: px, y: py, speedKmh: kmh, headingDeg: 0, brakePedal: 0, tickEvents: [] });
    if (res.events.some((e) => e.kind === "collision")) hits.push(Number(t.toFixed(4)));
  }
  return hits;
}

/** Closest the car's real path comes to the student's box, m (fine sampling of the circle). */
function trueMinSeparation(px: number, py: number): number {
  let min = Infinity;
  for (let t = 0; t <= 2; t += 1 / 2000) {
    const c = carAt(t);
    min = Math.min(min, obbSeparationM(playerObb(px, py, 0), actorObb(c)));
  }
  return min;
}

/** Closest the CHORD of the long frame comes to his box, m. */
function chordMinSeparation(px: number, py: number): number {
  const a = carAt(T_MID - 0.25);
  const b = carAt(T_MID + 0.25);
  let min = Infinity;
  for (let f = 0; f <= 1; f += 1 / 2000) {
    const x = a.x + (b.x - a.x) * f;
    const y = a.y + (b.y - a.y) * f;
    const ha = Math.atan2(a.dirX, a.dirY);
    let dh = Math.atan2(b.dirX, b.dirY) - ha;
    if (dh > Math.PI) dh -= 2 * Math.PI;
    if (dh < -Math.PI) dh += 2 * Math.PI;
    const h = ha + dh * f;
    min = Math.min(min, obbSeparationM(playerObb(px, py, 0), actorObb({ x, y, dirX: Math.sin(h), dirY: Math.cos(h) })));
  }
  return min;
}

describe("a long frame neither invents nor hides a contact with a staged car (sentinel at the physics sub-step)", () => {
  it("INSIDE THE BEND: clear of the real path, crossed by the chord — no collision at 60 Hz or on the long frame", () => {
    const px = 7.0;
    const py = 0;
    // The geometry first: the claim is about these two numbers.
    expect(trueMinSeparation(px, py)).toBeGreaterThan(0.25);
    expect(chordMinSeparation(px, py)).toBeLessThan(0);
    expect(run(1 / 60, true, px, py), "60 Hz truth").toEqual([]);
    expect(run(0.5, true, px, py), "0.5 s frame, sub-step contract").toEqual([]);
    // …and the frame-only sweep really did invent it.
    expect(run(0.5, false, px, py).length, "frame-only director (the old behaviour)").toBeGreaterThan(0);
  });

  it("OUTSIDE THE BEND: on the real path, never reached by the chord — billed at 60 Hz and on the long frame", () => {
    const px = R + 1.0;
    const py = 0;
    expect(trueMinSeparation(px, py)).toBeLessThan(-0.5);
    expect(chordMinSeparation(px, py)).toBeGreaterThan(0.5);
    const truth = run(1 / 60, true, px, py);
    expect(truth.length, "60 Hz truth").toBeGreaterThan(0);
    const long = run(0.5, true, px, py);
    expect(long.length, "0.5 s frame, sub-step contract").toBeGreaterThan(0);
    // Billed on the frame that holds the bend's middle (one per body per frame).
    expect(long).toEqual([T_MID + 0.25]);
    // …and the frame-only sweep really did hide it.
    expect(run(0.5, false, px, py), "frame-only director (the old behaviour)").toEqual([]);
  });

  it("one collision per body per frame, whatever the number of sub-steps it was found on", () => {
    const px = R + 1.0;
    const port = new ArcPort(true);
    const director = createScenarioDirector([SPEC], port, { seed: 1 });
    director.step({ tSec: 0, dtSec: 0, x: px, y: 0, speedKmh: 5, headingDeg: 0, brakePedal: 0, tickEvents: [] });
    port.update(T_MID - 0.25, px, 0, 5);
    director.step({ tSec: T_MID - 0.25, dtSec: T_MID - 0.25, x: px, y: 0, speedKmh: 5, headingDeg: 0, brakePedal: 0, tickEvents: [] });
    port.update(0.5, px, 0, 5);
    const res = director.step({ tSec: T_MID + 0.25, dtSec: 0.5, x: px, y: 0, speedKmh: 5, headingDeg: 0, brakePedal: 0, tickEvents: [] });
    expect(res.events.filter((e) => e.kind === "collision")).toHaveLength(1);
  });
});

/*
 * ROUND 3 — THE SAME BEND ON THE FIXED-STEP GRID (traffic/system.ts stepGrid).
 * The live TrafficSystem no longer cuts a frame into equal steps: with the
 * session clock it advances only in whole steps at the grid points k·STEP,
 * calls the listener AFTER every step whose grid point lies inside the frame
 * (with that point's session time), and tells the director at `frameEnd`
 * whether the frame end is itself a grid point. `GridArcPort` keeps exactly
 * that contract. A contact must then be found at the SAME grid point on every
 * cadence — 60 Hz, faster than the step (120, 144 Hz), a 60 Hz that jitters
 * ±1 ms (its ends are never grid points) and half-second frames whose ends are
 * off the grid — and billed with the frame that holds that point.
 */

/** The grid-protocol port: whole steps at k·STEP, decisions at grid points only. */
class GridArcPort implements StagedTrafficPort {
  private listener: StagedSubstepListener | null = null;
  private k = 0;
  private tPrev = 0;
  readonly view = {
    id: SPEC.id,
    kind: "vehicle",
    x: 0,
    y: 0,
    dirX: 0,
    dirY: 1,
    speedMps: V,
    s: 0,
    pathLengthM: 1000,
    nodeS: [0, 1000],
    finished: false,
  } as unknown as StagedActorView;
  private readonly player: StagedSubstepPlayer = { x: 0, y: 0, speedKmh: 0, headingDeg: 0 };

  constructor() {
    this.place(0);
  }
  private place(t: number): void {
    const c = carAt(t);
    const v = this.view as unknown as { x: number; y: number; dirX: number; dirY: number };
    v.x = c.x;
    v.y = c.y;
    v.dirX = c.dirX;
    v.dirY = c.dirY;
  }
  stage(_spec: StagedActorSpec): StagedActorView | null {
    return this.view;
  }
  stagedCommand(_id: string, _command: StagedCommand): void {}
  staged(_id: string): StagedActorView | null {
    return this.view;
  }
  setStagedSubstepListener(listener: StagedSubstepListener | null): void {
    this.listener = listener;
  }
  /** The frame ending at session time `tEnd`; the student stands at (px, py). */
  update(tEnd: number, px: number, py: number, kmh: number): void {
    const frameSec = tEnd - this.tPrev;
    const target = Math.floor(tEnd / STEP + 1e-6);
    const onGrid = Math.abs(tEnd - target * STEP) < 1e-7;
    for (let k = this.k + 1; k <= target; k++) {
      this.place(k * STEP);
      this.k = k;
      if (!(k === target && onGrid) && this.listener) {
        this.player.x = px;
        this.player.y = py;
        this.player.speedKmh = kmh;
        this.player.headingDeg = 0;
        this.listener.substep(k * STEP - this.tPrev, STEP, frameSec, this.player, k * STEP);
      }
    }
    this.tPrev = tEnd;
    this.listener?.frameEnd(onGrid, STEP);
  }
}

/** Frame ends on a cadence from t = 0 to 2 s (the first frame closes the 0 → first gap). */
function gridRun(frameEnds: readonly number[], px: number, py: number): number[] {
  const port = new GridArcPort();
  const director = createScenarioDirector([SPEC], port, { seed: 1 });
  const kmh = 5;
  const hits: number[] = [];
  director.step({ tSec: 0, dtSec: 0, x: px, y: py, speedKmh: kmh, headingDeg: 0, brakePedal: 0, tickEvents: [] });
  let t = 0;
  for (const tEnd of frameEnds) {
    port.update(tEnd, px, py, kmh);
    const res = director.step({ tSec: tEnd, dtSec: tEnd - t, x: px, y: py, speedKmh: kmh, headingDeg: 0, brakePedal: 0, tickEvents: [] });
    if (res.events.some((e) => e.kind === "collision")) hits.push(tEnd);
    t = tEnd;
  }
  return hits;
}

function endsOf(deltas: readonly number[], until = 2): number[] {
  const out: number[] = [];
  let t = 0;
  for (let i = 0; t < until - 1e-9; i++) {
    t += deltas[i % deltas.length];
    out.push(t);
  }
  return out;
}

function jitter60(n: number): number[] {
  let x = 777;
  const o: number[] = [];
  for (let i = 0; i < n; i++) {
    x = (x * 1103515245 + 12345) % 2147483648;
    o.push(1 / 60 - 0.001 + (x / 2147483648) * 0.002);
  }
  return o;
}

const GRID_CADENCES: ReadonlyArray<readonly [string, number[]]> = [
  ["120 Hz", endsOf([1 / 120])],
  ["144 Hz", endsOf([1 / 144])],
  ["60 Hz ±1 ms", endsOf(jitter60(400))],
  // Half-second frames whose ends are never grid points (0.2537 + 0.5 k).
  ["0.5 s off the grid", [0.2537, ...endsOf([0.5]).map((t) => t + 0.2537)].filter((t) => t <= 2)],
];

describe("round 3: on the fixed-step grid a contact is found at the same grid point on every cadence", () => {
  const truthEnds = endsOf([1 / 60]);

  it("INSIDE THE BEND: no collision on any cadence", () => {
    const px = 7.0;
    expect(gridRun(truthEnds, px, 0), "60 Hz").toEqual([]);
    for (const [name, ends] of GRID_CADENCES) expect(gridRun(ends, px, 0), name).toEqual([]);
  });

  it("OUTSIDE THE BEND: billed on every cadence, in the frame that holds the 60 Hz contact's grid point", () => {
    const px = R + 1.0;
    const truth = gridRun(truthEnds, px, 0);
    expect(truth.length, "60 Hz truth").toBeGreaterThan(0);
    const first = truth[0];
    for (const [name, ends] of GRID_CADENCES) {
      const hits = gridRun(ends, px, 0);
      expect(hits.length, `${name}: billed`).toBeGreaterThan(0);
      const i = ends.indexOf(hits[0]);
      const prev = i > 0 ? ends[i - 1] : 0;
      // The frame (prev, hits[0]] holds the grid point the 60 Hz run first billed.
      expect(prev < first - 1e-9 && hits[0] >= first - 1e-9, `${name}: first billed on the frame ending ${hits[0].toFixed(4)} (prev ${prev.toFixed(4)}), 60 Hz contact at ${first.toFixed(4)}`).toBe(true);
    }
  });

  it("a frame end off the grid decides nothing: no runner step, no sentinel look, no collision billed twice", () => {
    const px = R + 1.0;
    // 144 Hz: most frame ends are not grid points; the contact lasts many steps.
    const ends = endsOf([1 / 144]);
    const port = new GridArcPort();
    const director = createScenarioDirector([SPEC], port, { seed: 1 });
    director.step({ tSec: 0, dtSec: 0, x: px, y: 0, speedKmh: 5, headingDeg: 0, brakePedal: 0, tickEvents: [] });
    let t = 0;
    let billed = 0;
    for (const tEnd of ends) {
      port.update(tEnd, px, 0, 5);
      const res = director.step({ tSec: tEnd, dtSec: tEnd - t, x: px, y: 0, speedKmh: 5, headingDeg: 0, brakePedal: 0, tickEvents: [] });
      const n = res.events.filter((e) => e.kind === "collision").length;
      expect(n, `frame ending ${tEnd.toFixed(4)}`).toBeLessThanOrEqual(1);
      billed += n;
      t = tEnd;
    }
    // …and exactly as many as the 60 Hz truth bills (one per grid decision in contact).
    expect(billed).toBe(gridRun(truthEnds, px, 0).length);
  });
});
