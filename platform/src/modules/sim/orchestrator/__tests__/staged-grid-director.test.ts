/**
 * THE DIRECTOR ON THE FIXED-STEP GRID — sc-roundabout-entry:7b747c15 round 3.
 *
 * With the session clock the traffic system advances the world only at the
 * grid points k·FIXED_DT (traffic/system.ts `stepGrid`) and tells the director
 * at `frameEnd(decideAtEnd)` whether the frame's END is one. A frame end that
 * is not decides nothing — so the runtime's tick events of that frame (the
 * roundabout tracker's verdict, a turn start, a crossing passed) cannot be
 * heard there. They are HELD and heard at the next grid decision, in order,
 * exactly once. Pinned here with the one runner whose resolution is nothing
 * but a tick event (RoundaboutEntryRunner hears «prioritySituation:
 * roundabout» in every live phase), on a port that keeps the grid contract.
 */

import { describe, expect, it } from "vitest";
import type { RoundaboutEntrySpec, StagedEventOutcome, StagedEventSpec } from "../../contracts";
import { compileScenario } from "../../lessons/scenario/compile";
import { SC_ROUNDABOUT_ENTRY } from "../../lessons/scenario/templates-flow";
import type { SimTickEvent } from "../../rules";
import type {
  StagedActorSpec,
  StagedActorView,
  StagedCommand,
  StagedSubstepListener,
  StagedSubstepPlayer,
} from "../../traffic/types";
import { createScenarioDirector } from "../director";
import type { StagedTrafficPort } from "../types";

const STEP = 1 / 60;
const RING = (compileScenario(SC_ROUNDABOUT_ENTRY, 1).stagedEvents ?? []).find(
  (s) => s.kind === "roundaboutEntry",
) as RoundaboutEntrySpec;

/** A parked circulator far away, and the grid contract (whole steps at k·STEP). */
class GridPort implements StagedTrafficPort {
  private listener: StagedSubstepListener | null = null;
  private k = 0;
  private tPrev = 0;
  readonly view = {
    id: RING.id,
    kind: "vehicle",
    x: 1e4,
    y: 1e4,
    dirX: 1,
    dirY: 0,
    speedMps: 0,
    s: 0,
    pathLengthM: 1000,
    nodeS: [0, 1000],
    finished: false,
  } as unknown as StagedActorView;
  private readonly player: StagedSubstepPlayer = { x: 0, y: -200, speedKmh: 0, headingDeg: 0 };
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
  update(tEnd: number): void {
    const frameSec = tEnd - this.tPrev;
    const target = Math.floor(tEnd / STEP + 1e-6);
    const onGrid = Math.abs(tEnd - target * STEP) < 1e-7;
    for (let k = this.k + 1; k <= target; k++) {
      this.k = k;
      if (!(k === target && onGrid)) this.listener?.substep(k * STEP - this.tPrev, STEP, frameSec, this.player, k * STEP);
    }
    this.tPrev = tEnd;
    this.listener?.frameEnd(onGrid, STEP);
  }
}

const YIELDED: SimTickEvent = { kind: "prioritySituation", situation: "roundabout", violated: false, yielded: true } as SimTickEvent;

/** Frame ends on `deltas`; the tracker's verdict rides the tick of the frame ending at `verdictAt`. */
function drive(deltas: readonly number[], verdictAt: number, until = 1) {
  const port = new GridPort();
  const director = createScenarioDirector([RING] as StagedEventSpec[], port, { seed: 1 });
  director.step({ tSec: 0, dtSec: 0, x: 0, y: -200, speedKmh: 0, headingDeg: 0, brakePedal: 0, tickEvents: [] });
  const got: Array<{ t: number; outcomes: StagedEventOutcome[] }> = [];
  let t = 0;
  let i = 0;
  let verdictFrame = -1;
  while (t < until - 1e-9) {
    const tEnd = t + deltas[i++ % deltas.length];
    port.update(tEnd);
    const ticks = verdictFrame < 0 && tEnd >= verdictAt - 1e-9 ? [YIELDED] : [];
    if (ticks.length > 0) verdictFrame = tEnd;
    const r = director.step({ tSec: tEnd, dtSec: tEnd - t, x: 0, y: -200, speedKmh: 0, headingDeg: 0, brakePedal: 0, tickEvents: ticks });
    got.push({ t: tEnd, outcomes: r.outcomes });
    t = tEnd;
  }
  return { got, verdictFrame };
}

describe("round 3: tick events of a frame that ends between two grid points", () => {
  it("60 Hz: the verdict is heard on its own frame (the frame end IS the grid point)", () => {
    const { got, verdictFrame } = drive([STEP], 0.5);
    const hits = got.filter((g) => g.outcomes.length > 0);
    expect(hits.map((h) => h.t)).toEqual([verdictFrame]);
    expect(hits[0].outcomes.map((o) => o.detail)).toEqual(["yielded"]);
  });

  it("144 Hz: held, heard at the NEXT grid decision — exactly once, never lost", () => {
    const { got, verdictFrame } = drive([1 / 144], 0.505);
    // The verdict's frame ends between two grid points: nothing is decided there…
    const k = Math.floor(verdictFrame / STEP + 1e-6);
    expect(Math.abs(verdictFrame - k * STEP), "the verdict frame ends off the grid").toBeGreaterThan(1e-4);
    const at = got.find((g) => g.t === verdictFrame)!;
    expect(at.outcomes, "nothing decided at an off-grid frame end").toEqual([]);
    // …and the very next grid point resolves it, once.
    const hits = got.filter((g) => g.outcomes.length > 0);
    expect(hits).toHaveLength(1);
    expect(hits[0].outcomes.map((o) => o.detail)).toEqual(["yielded"]);
    const prev = got[got.indexOf(hits[0]) - 1].t;
    expect(prev < (k + 1) * STEP && hits[0].t >= (k + 1) * STEP - 1e-9, `resolved on the frame holding grid point ${((k + 1) * STEP).toFixed(4)} s`).toBe(true);
  });

  it("0.37 s frames: held across the frame end, heard at the first grid point of the next frame", () => {
    const { got, verdictFrame } = drive([0.37], 0.5, 2);
    const hits = got.filter((g) => g.outcomes.length > 0);
    expect(hits).toHaveLength(1);
    expect(hits[0].outcomes.map((o) => o.detail)).toEqual(["yielded"]);
    // Decided inside the NEXT frame (its first grid point), delivered with it.
    expect(hits[0].t).toBeGreaterThan(verdictFrame);
    expect(got[got.indexOf(hits[0]) - 1].t).toBe(verdictFrame);
  });
});

/**
 * ROUND 4 — the grid-decision interval, pinned on the director itself.
 *
 * In the product the graded chain now runs once per grid point
 * (scene/gradeGrid.ts), so every `traffic.update` crosses exactly one grid
 * point and the director's multi-point path (`substep` with a grid time, the
 * off-grid frame end that decides nothing) is reached only by a caller that
 * hands the traffic system a frame spanning several grid points — the
 * TrafficSystem contract still allows it. Round 4's mutation re-run showed two
 * round-3 sabotages of that path surviving every test once the property and
 * census pins moved onto the grade grid (DTF: the interval between two grid
 * decisions as a float difference; SKIP: an off-grid frame end that leaves the
 * «last decision was a frame step» flag set, so the next on-grid frame end
 * hands its runners the FRAME's dt). Pinned here: every runner step the
 * director takes on the grid is at k·STEP with dt EXACTLY (k − kLast)·STEP —
 * the number a 60 Hz frame hands it — on every cadence, and the dt's sum to the
 * session time decided.
 */
describe("round 4: the interval between two grid decisions", () => {
  type Seen = { t: number; dt: number };
  function decisions(deltas: readonly number[], until: number): Seen[] {
    const port = new GridPort();
    const director = createScenarioDirector([RING] as StagedEventSpec[], port, { seed: 1 });
    const runners = (director as unknown as { runners: Array<{ step: (...a: unknown[]) => unknown }> }).runners;
    expect(runners, "the director under test owns the ring runner").toHaveLength(1);
    const seen: Seen[] = [];
    const inner = runners[0].step.bind(runners[0]);
    runners[0].step = (traffic: unknown, input: unknown, events: unknown) => {
      const inp = input as { tSec: number; dtSec: number };
      seen.push({ t: inp.tSec, dt: inp.dtSec });
      return inner(traffic, input, events);
    };
    director.step({ tSec: 0, dtSec: 0, x: 0, y: -200, speedKmh: 0, headingDeg: 0, brakePedal: 0, tickEvents: [] });
    let t = 0;
    let i = 0;
    while (t < until - 1e-9) {
      const tEnd = t + deltas[i++ % deltas.length];
      port.update(tEnd);
      const dtFrame = deltas[(i - 1) % deltas.length];
      director.step({ tSec: tEnd, dtSec: dtFrame, x: 0, y: -200, speedKmh: 0, headingDeg: 0, brakePedal: 0, tickEvents: [] });
      t = tEnd;
    }
    return seen.slice(1); // the t = 0 frame step (no grid yet)
  }

  const CADENCES: Array<[string, number[]]> = [
    ["60 Hz", [STEP]],
    ["120 Hz", [1 / 120]],
    ["144 Hz", [1 / 144]],
    ["0.37 s", [0.37]],
    ["0.5 s", [0.5]],
    ["0.25/0.4 s", [0.25, 0.4]],
  ];
  for (const [name, deltas] of CADENCES) {
    it(`${name}: one decision per grid point, at k·STEP, dt exactly the 60 Hz step`, () => {
      const seen = decisions(deltas, 3);
      expect(seen.length, `${name}: decisions`).toBeGreaterThanOrEqual(179);
      const offGrid = seen.filter((s, n) => s.t !== (n + 1) * STEP);
      expect(offGrid.slice(0, 3), `${name}: decision times are the grid's own k·STEP`).toEqual([]);
      const badDt = seen.filter((s) => !Object.is(s.dt, STEP)).map((s) => `t=${s.t.toFixed(4)} dt=${s.dt}`);
      expect(badDt.slice(0, 3), `${name}: dt between two grid decisions is (k − kLast)·STEP, never a float difference or the frame's own dt`).toEqual([]);
    });
  }
});
