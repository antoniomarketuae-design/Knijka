/**
 * THE DIRECTOR'S SUB-STEP CONTRACT — sc-roundabout-entry:7b747c15 round 2
 * (verifier condition C4: five mutants of round 1 survived; each test below
 * is the one that kills one of them, on its assertion).
 *
 * Since round 1 the director also steps its runners and its contact sentinel
 * BETWEEN the staged world's physics steps inside a long frame (director.ts
 * `substep`), queues what they emit, and delivers it with the frame. That is
 * five promises, and a long frame breaks each one differently:
 *
 *   V2 ONE COLLISION PER BODY PER FRAME, the frame step included. The
 *      sentinel reports an open contact on EVERY watch, so a contact that
 *      starts at a sub-step and is still open at the frame end is seen twice
 *      in one frame — a 60 Hz frame bills it once.
 *   V3 THE LAW BEFORE THE CRASH (THEO-4). A rule broken at a sub-step and a
 *      contact that follows it in the same long frame must read in the order
 *      they happened — the order every 60 Hz frame sequence gives them.
 *   V4 A REVERSING STUDENT STAYS REVERSING. LessonScene hands the director a
 *      signed speed but the traffic system's interpolation may carry a
 *      magnitude (liveChainReplay passes |v|); a runner gated on „moving
 *      forward" must not see a reversing student as moving forward between two
 *      frames that both said he was reversing.
 *   V5 A RETRY FORGETS THE SUB-STEP STATE. reset() teleports everything and
 *      the session clock restarts; a sub-step that still interpolated from the
 *      frame before the retry would run the runners at the OLD clock.
 *   V7 THE AMBER DILEMMA STAYS FRAME-CLOCKED. It pins the signal cluster's
 *      phase relative to the signal clock, which `runtime.update(dt)` has
 *      already moved to the frame's END before any sub-step runs; deciding at
 *      a sub-step pairs an earlier pose with a later clock and lands the yellow
 *      up to a frame late.
 *
 * Every port here keeps the TrafficSystem's sub-step contract (traffic/
 * system.ts `update`: ≤ 1/60 s steps, the listener before every step but the
 * first, `frameEnd` after) and every pose is the test's own arithmetic.
 */

import { describe, expect, it } from "vitest";
import type {
  AmberDilemmaSpec,
  BrakingLeadCarSpec,
  StagedEventOutcome,
  StagedEventSpec,
  TelltaleStopSpec,
} from "../../contracts";
import type { SimTickEvent } from "../../rules";
import type {
  StagedActorSpec,
  StagedActorView,
  StagedCommand,
  StagedSubstepListener,
  StagedSubstepPlayer,
} from "../../traffic/types";
import { createScenarioDirector } from "../director";
import type { ScenarioDirector, SignalDirectorPort, StagedTrafficPort } from "../types";

const STEP = 1 / 60;

interface Pose {
  x: number;
  y: number;
  /** Signed, as LessonScene hands it to the director. */
  kmh: number;
  headingDeg: number;
  brake: number;
}

/** A port whose (optional) car pose and whose student are functions of session time. */
class ScriptPort implements StagedTrafficPort {
  private listener: StagedSubstepListener | null = null;
  t = 0;
  readonly view = {
    id: "car",
    kind: "vehicle",
    x: 1e4,
    y: 1e4,
    dirX: -1,
    dirY: 0,
    speedMps: 0,
    s: 0,
    pathLengthM: 1000,
    nodeS: [0, 1000],
    finished: false,
  } as unknown as StagedActorView;
  private readonly sub: StagedSubstepPlayer = { x: 0, y: 0, speedKmh: 0, headingDeg: 0 };
  /** Called before each frame's sub-steps with the frame's END time (runtime.update). */
  onFrameStart: (tEnd: number) => void = () => {};

  constructor(
    private readonly car: ((t: number) => { x: number; y: number; dirX: number; dirY: number; v: number }) | null,
    private readonly player: (t: number) => Pose,
    /** What the traffic system's interpolation carries as speed: signed or |v|. */
    private readonly magnitudeSpeed: boolean,
  ) {
    this.place(0);
  }
  private place(t: number): void {
    if (!this.car) return;
    const c = this.car(t);
    const v = this.view as unknown as { x: number; y: number; dirX: number; dirY: number; speedMps: number };
    v.x = c.x;
    v.y = c.y;
    v.dirX = c.dirX;
    v.dirY = c.dirY;
    v.speedMps = c.v;
  }
  stage(_spec: StagedActorSpec): StagedActorView | null {
    return this.car ? this.view : null;
  }
  stagedCommand(_id: string, _command: StagedCommand): void {}
  staged(_id: string): StagedActorView | null {
    return this.car ? this.view : null;
  }
  setStagedSubstepListener(listener: StagedSubstepListener | null): void {
    this.listener = listener;
  }
  /** One frame of `dt`, the sub-step contract, the student exact at every step. */
  update(dt: number): void {
    this.onFrameStart(this.t + dt);
    const n = Math.max(1, Math.ceil(dt / STEP - 1e-9));
    const h = dt / n;
    const t0 = this.t;
    for (let j = 0; j < n; j++) {
      if (j > 0 && this.listener) {
        const p = this.player(t0 + j * h);
        this.sub.x = p.x;
        this.sub.y = p.y;
        this.sub.speedKmh = this.magnitudeSpeed ? Math.abs(p.kmh) : p.kmh;
        this.sub.headingDeg = p.headingDeg;
        this.listener.substep(j * h, h, dt, this.sub);
      }
      this.place(t0 + (j + 1) * h);
    }
    this.t = t0 + dt;
    this.listener?.frameEnd();
  }
}

interface Delivered {
  t: number;
  events: SimTickEvent[];
  outcomes: StagedEventOutcome[];
}

/** Drive `frames` (each a frame END time, ascending) through port + director. */
function drive(
  director: ScenarioDirector,
  port: ScriptPort,
  player: (t: number) => Pose,
  frames: readonly number[],
): Delivered[] {
  const out: Delivered[] = [];
  const p0 = player(0);
  director.step({ tSec: 0, dtSec: 0, x: p0.x, y: p0.y, speedKmh: p0.kmh, headingDeg: p0.headingDeg, brakePedal: p0.brake, tickEvents: [] });
  for (const tEnd of frames) {
    const dt = tEnd - port.t;
    port.update(dt);
    const p = player(tEnd);
    const r = director.step({ tSec: tEnd, dtSec: dt, x: p.x, y: p.y, speedKmh: p.kmh, headingDeg: p.headingDeg, brakePedal: p.brake, tickEvents: [] });
    out.push({ t: tEnd, events: r.events, outcomes: r.outcomes });
  }
  return out;
}

/** Frame END times: 1/60 s frames to `until`, with the frames listed in `long` replaced by one each. */
function frameGrid(until: number, long: ReadonlyArray<readonly [number, number]> = []): number[] {
  const out: number[] = [];
  let k = 1;
  for (;;) {
    let t = k * STEP;
    const lf = long.find(([a]) => Math.abs(t - STEP - a) < 1e-9);
    if (lf) {
      out.push(lf[1]);
      k = Math.round(lf[1] / STEP) + 1;
      t = lf[1];
      if (t >= until - 1e-9) break;
      continue;
    }
    if (t > until + 1e-9) break;
    out.push(t);
    k++;
  }
  return out;
}

// ---------------------------------------------------------------------------
// V2 + V3 — a red warning lamp driven past at a sub-step, then a side impact
// that is still open at the frame's end, all inside ONE 0.5 s frame.
// ---------------------------------------------------------------------------

/** He drives north along x = 0 from y = −20 at 10 m/s. */
const northAt10 = (t: number): Pose => ({ x: 0, y: -20 + 10 * t, kmh: 36, headingDeg: 0, brake: 0 });
/** The lamp lights at y = −5 (t 1.5 s); driving 3 m past the trigger is the violation (t 2.3 s). */
const LAMP: TelltaleStopSpec = {
  id: "t-lamp",
  kind: "telltaleStimulus",
  lamp: "temperature",
  trigger: { x: 0, y: 0 },
  triggerDistM: 5,
  ignoreBeyondM: 3,
  stop: { x: 0, y: 500 },
  stopRadiusM: 1,
  stopSpeedKmh: 5,
} as unknown as TelltaleStopSpec;
/** A body for the sentinel's cast (its runner's commands are ignored by the port). */
const CAR: BrakingLeadCarSpec = {
  id: "car",
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
/** Westbound at 20 m/s along y = 6: its box meets his from t ≈ 2.44 s and stays on him past 2.5 s. */
const westAt20 = (t: number) => ({ x: 52 - 20 * t, y: 6, dirX: -1, dirY: 0, v: 20 });

function lampAndCrash(longFrame: boolean): Delivered[] {
  const port = new ScriptPort(westAt20, northAt10, false);
  const director = createScenarioDirector([LAMP, CAR] as StagedEventSpec[], port, { seed: 3 });
  return drive(director, port, northAt10, frameGrid(3, longFrame ? [[2.0, 2.5]] : []));
}

const isLaw = (e: SimTickEvent) => e.kind === "prioritySituation";
const isCrash = (e: SimTickEvent) => e.kind === "collision";

describe("the director's sub-step contract on a long frame", () => {
  it("V2+V3: the law reads before the crash, and an open contact is billed ONCE in the frame it spans", () => {
    // The 60 Hz truth: the violation lands at 2.3 s, the first contact after it, at most one per frame.
    const truth = lampAndCrash(false);
    const lawT = truth.find((d) => d.events.some(isLaw))?.t;
    const crashT = truth.find((d) => d.events.some(isCrash))?.t;
    expect(lawT, "60 Hz: the lamp violation").toBeDefined();
    expect(crashT, "60 Hz: the side impact").toBeDefined();
    expect(lawT!).toBeLessThan(crashT!);
    expect(lawT!).toBeLessThan(2.5);
    expect(crashT!).toBeLessThan(2.5);
    for (const d of truth) expect(d.events.filter(isCrash).length, `60 Hz frame ${d.t}`).toBeLessThanOrEqual(1);

    // One 0.5 s frame holding both, with the contact still open at its end.
    const long = lampAndCrash(true);
    const frame = long.find((d) => Math.abs(d.t - 2.5) < 1e-9)!;
    const kinds = frame.events.map((e) => e.kind);
    expect(kinds.filter((k) => k === "collision"), "V2: one collision per body per frame").toHaveLength(1);
    const iLaw = frame.events.findIndex(isLaw);
    const iCrash = frame.events.findIndex(isCrash);
    expect(iLaw, "the violation is delivered with this frame").toBeGreaterThanOrEqual(0);
    expect(iLaw, "V3: «не спря при червената лампа» before «сблъсък»").toBeLessThan(iCrash);
    // Nothing was billed for this frame on an earlier frame.
    expect(long.filter((d) => d.t < 2.5).some((d) => d.events.some(isLaw) || d.events.some(isCrash))).toBe(false);
  });

  // -------------------------------------------------------------------------
  // V4 — reversing past the lamp's trigger: the lamp is for a car that is
  // MOVING, and reversing at 10 km/h toward it is not that.
  // -------------------------------------------------------------------------
  it("V4: a student reversing through the trigger is never read as driving forward at a sub-step", () => {
    // Facing north, reversing south from y = 12 at 10 km/h: inside the 5 m trigger radius from t ≈ 2.5 s.
    const reversing = (t: number): Pose => ({ x: 0, y: 12 - (10 / 3.6) * t, kmh: -10, headingDeg: 0, brake: 0 });
    const lit = (frames: number[]) => {
      // The traffic system's interpolation carries |v| (liveChainReplay's convention).
      const port = new ScriptPort(null, reversing, true);
      const director = createScenarioDirector([LAMP] as StagedEventSpec[], port, { seed: 3 });
      let everLit = false;
      const p0 = reversing(0);
      director.step({ tSec: 0, dtSec: 0, x: p0.x, y: p0.y, speedKmh: p0.kmh, headingDeg: 0, brakePedal: 0, tickEvents: [] });
      for (const tEnd of frames) {
        const dt = tEnd - port.t;
        port.update(dt);
        const p = reversing(tEnd);
        director.step({ tSec: tEnd, dtSec: dt, x: p.x, y: p.y, speedKmh: p.kmh, headingDeg: 0, brakePedal: 0, tickEvents: [] });
        everLit ||= director.telltaleLit;
      }
      return everLit;
    };
    expect(lit(frameGrid(6)), "60 Hz").toBe(false);
    const halfSecond = Array.from({ length: 12 }, (_, i) => 0.5 * (i + 1));
    expect(lit(halfSecond), "0.5 s frames, |v| at the sub-steps").toBe(false);
  });

  // -------------------------------------------------------------------------
  // V5 — the retry. Before it he was approaching the lamp at t = 10 s; after
  // it the clock restarts and he drives into the trigger and stops for it.
  // -------------------------------------------------------------------------
  it("V5: reset() forgets the sub-step state — the first frame of a retry runs no runner at the old clock", () => {
    const LAMP_STOP: TelltaleStopSpec = { ...LAMP, stop: { x: 0, y: 2 }, stopRadiusM: 3 } as TelltaleStopSpec;
    let retry = false;
    // Attempt 1: crawling north far short of the trigger. Attempt 2 (after reset): from y = −9 at 72 km/h,
    // into the 5 m trigger radius at 0.2 s, braking from the frame ending 1.0 s, at rest in the stop zone by 1.5 s.
    const player = (t: number): Pose =>
      !retry
        ? { x: 0, y: -60 + 1 * t, kmh: 3.6, headingDeg: 0, brake: 0 }
        : t <= 0.5
          ? { x: 0, y: -9 + 20 * t, kmh: 72, headingDeg: 0, brake: 0 }
          : t <= 1.0
            ? { x: 0, y: 1 + 3 * (t - 0.5), kmh: 36 - 30 * (t - 0.5), headingDeg: 0, brake: t >= 1.0 - 1e-9 ? 1 : 0 }
            : { x: 0, y: 2.5 + 0.5 * (t - 1.0), kmh: 21 - 36 * (t - 1.0), headingDeg: 0, brake: 1 };
    const port = new ScriptPort(null, player, false);
    const director = createScenarioDirector([LAMP_STOP] as StagedEventSpec[], port, { seed: 3 });
    drive(director, port, player, Array.from({ length: 20 }, (_, i) => 0.5 * (i + 1)));
    expect(director.telltaleLit, "attempt 1 never reached the lamp").toBe(false);
    // The retry: everything teleports and the session clock starts again.
    director.reset();
    retry = true;
    port.t = 0;
    // As the live loop does after a retry: the next frame integrates traffic (sub-steps and all)
    // BEFORE the director is stepped again.
    const res: StagedEventOutcome[] = [];
    for (const tEnd of [0.5, 1.0, 1.5]) {
      const dt = tEnd - port.t;
      port.update(dt);
      const p = player(tEnd);
      const r = director.step({ tSec: tEnd, dtSec: dt, x: p.x, y: p.y, speedKmh: p.kmh, headingDeg: 0, brakePedal: p.brake, tickEvents: [] });
      res.push(...r.outcomes);
    }
    const lamp = res.find((o) => o.eventId === "t-lamp");
    expect(lamp, "the stop resolved the lamp").toBeDefined();
    expect(lamp!.detail).toBe("yielded");
    // The first frame of the retry has no sub-step state to interpolate from, so the lamp is lit at
    // its frame step (0.5 s) and he brakes on the next (1.0 s): 0.5 s to react. A sub-step run at the
    // pre-retry clock would have lit it at ≈ 10.2 s and measured ≈ −9.2 s.
    expect(lamp!.reactionTimeSec, "V5: reaction measured on the retry's own clock").toBeCloseTo(0.5, 6);
  });

  // -------------------------------------------------------------------------
  // V7 — the amber dilemma pins the yellow `flipEtaSec` of travel before the
  // line. Its arithmetic is exact only against the clock the signals keep.
  // -------------------------------------------------------------------------
  it("V7: an amber dilemma armed inside a long frame pins the yellow where the 60 Hz drive pins it", () => {
    const AMBER: AmberDilemmaSpec = {
      id: "t-amber",
      kind: "amberDilemma",
      signalNodeId: "sig",
      junction: { x: 0, y: 100 },
      armDistM: 60,
      minTriggerSpeedKmh: 20,
      lineDistM: 10,
      flipEtaSec: 2,
    } as AmberDilemmaSpec;
    /** North along x = 0 from y = 0 at 15 m/s: armed at y = 40 (t 2.667 s); the line is at y = 90. */
    const north15 = (t: number): Pose => ({ x: 0, y: 15 * t, kmh: 54, headingDeg: 0, brake: 0 });
    const yellowAt = (frames: number[]) => {
      let clock = 0;
      let yellowStart = NaN;
      const signals: SignalDirectorPort = {
        signalPhaseInfo: () => ({ phase: "green", timeToChangeSec: 99 }),
        // The „offset" this fake hands back IS the absolute session time the yellow starts.
        signalOffsetForPhaseStart: (_id, _b, _ph, inSec) => clock + inSec,
        setSignalClusterOffset: (_id, offset) => {
          yellowStart = offset;
        },
      };
      const port = new ScriptPort(null, north15, false);
      // runtime.update(dt) runs BEFORE traffic.update: the signal clock is at the frame's end.
      port.onFrameStart = (tEnd) => {
        clock = tEnd;
      };
      const director = createScenarioDirector([AMBER] as StagedEventSpec[], port, { seed: 5, signals });
      drive(director, port, north15, frames);
      return yellowStart;
    };
    const truth = yellowAt(frameGrid(5));
    // Constant speed: the pinned yellow is the same instant whenever he is armed (6 s − flipEta ± jitter),
    // as long as the flip is still ahead of him when he is armed (flipEta 2 s < his 3 s ETA at 3.0 s).
    expect(Number.isFinite(truth)).toBe(true);
    const long = yellowAt(Array.from({ length: 10 }, (_, i) => 0.5 * (i + 1)));
    expect(Math.abs(long - truth), "V7: yellow start on 0.5 s frames vs 60 Hz, s").toBeLessThan(STEP + 1e-6);
  });
});
