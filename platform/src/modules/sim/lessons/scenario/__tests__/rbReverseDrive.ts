/**
 * THE ROW'S DRIVE, IN PROCESS — sc-roundabout-entry:9e85f27e (lane rbreverse).
 * Test support only; nothing in the product imports it.
 *
 * rig-w3b SC2 (59be0de, 3 of 3): the student struck the central island nose
 * first, the recovery card told him to ease away, and he reversed on the ring
 * (≈ −4.3 km/h, ≈ 6.3 m) toward the staged circulator, which braked from
 * 2.9 m/s to a standstill about 1 m off his rear bumper.
 *
 * THIS DRIVE is the product chassis on rapier (`rapierContactDrive.ts
 * driveIntoContact`, the endings lanes' harness) on the lesson's LIVE world
 * (`buildLiveWorld` → `wireTrafficQueries`), with a REAL cabin
 * (`CabinControls`, so `SimTick.gear` is the product's contract gear off the
 * selector — the gear is never set directly). The drive:
 *
 *  1. approach on the south arm and stand short of the give-way line (the
 *     runner locks the circulation, the circulator cruises 2.9 m/s);
 *  2. wait there until the circulator is at `enterAtPhiDeg` (its azimuth from
 *     the south mouth, counter-clockwise), then enter and run the ring's east
 *     arc at ~14 km/h (the rig's own PATH);
 *  3. from y > −5.5 steer for the island and strike it nose first;
 *  4. brake to rest; from `reverseAfterS` after the strike reach R — by the
 *     SELECTOR (two gearDown steps at a frame's start, the [ key) or by the
 *     founder's 2026-08-11 GESTURE through the product's own
 *     `reverseAssistFrameStart` (brake lifted ≥ REVERSE_ASSIST_LIFT_S at rest,
 *     then pressed REVERSE_ASSIST_HOLD_S; the press carries on as the reverse
 *     accelerator, LAW 2's assist scope);
 *  5. reverse straight back at `reverseKmh` until `reverseM` from the rest
 *     pose, brake to rest (still in R), then a creep window (pedals off, R
 *     held), then hold the brake.
 *
 * `standStill: true` is STEP 0(c)'s counterfactual: the same drive, but the
 * car stays at rest against the island (brake held, D) — no R.
 *
 * `noStrike: true` (round 2, R1's crash-free case): the car enters the same
 * way but, where the drive would turn for the island, it brakes to rest ON
 * the ring instead — no contact, no crash pin — and the rest of the drive (R,
 * the reverse, the stop) runs from that rest exactly as from the strike's.
 *
 * A ring reverse that leaves BEFORE the circulator comes round (T3) is the same
 * drive with an earlier `enterAtPhiDeg`.
 */
import { FIXED_DT } from "../../../vehicle/tuning";
import { CabinControls } from "../../../scene/cabin";
import { ReverseAssist, REVERSE_ASSIST_HOLD_S, REVERSE_ASSIST_LIFT_S } from "../../../engine/reverseAssist";
import { PedalEdgeLog } from "../../../engine/pedalTiming";
import { reverseAssistFrameStart } from "@/components/sim/LessonScene";
import type { SimTick } from "../../../rules/types";
import type { LessonSpec } from "../../../contracts";
import type { TrafficSystem } from "../../../traffic";
import type { LessonStepResult } from "../../engine";
import type { LessonSessionState } from "../../types";
import { driveIntoContact, type DriveState } from "./rapierContactDrive";

const H = FIXED_DT;

/** The circulator's azimuth round the ring centre (0,0), degrees: 0 at the
 *  south mouth, 90 east, counter-clockwise (the way the ring is driven). */
export function ringPhiDeg(x: number, y: number): number {
  return (((Math.atan2(x, -y) * 180) / Math.PI) % 360 + 360) % 360;
}

/** The rig-w3b SC2 PATH from the south arm onto the east arc (cfg.PATH, its first points). */
const ENTER_PATH: ReadonlyArray<readonly [number, number]> = [
  [4.06, -100], [4.06, -27.5], [4.6, -23.5], [5.8, -20], [8, -17], [11.57, -13.789], [13.377, -12.044],
  [14.745, -10.324], [15.588, -9], [16.314, -7.607], [16.914, -6.156], [17.067, -5.711], [17.194, -5.257],
  [17.281, -4.792], [17.319, -4.318], [17.314, -3.997], [17.28, -3.673], [17.219, -3.347], [17.128, -3.02],
  [17.006, -2.694], [16.855, -2.369], [16.674, -2.047],
];
/** Where the drive aims once it turns for the island (inside it). */
const ISLAND_AIM = { x: 12.8, y: 2.6 };

export type ReverseRoute = "selector" | "gesture";

export interface RingReverseOptions {
  lesson: LessonSpec;
  raw: unknown;
  /** Enter the ring when the circulator's azimuth first reaches this, deg. */
  enterAtPhiDeg: number;
  /** How R is reached. */
  route: ReverseRoute;
  /** Seconds after the strike at which the R manoeuvre begins (default 5.6). */
  reverseAfterS?: number;
  reverseKmh?: number;
  reverseM?: number;
  /** STEP 0(c): never reverse — stand against the island, brake held. */
  standStill?: boolean;
  /** Round 2: no island strike — brake to rest on the ring where the drive
   *  would turn for the island; the R manoeuvre is timed from that halt. */
  noStrike?: boolean;
  /** Round 3 (the round-2 verifier's NUDGE cell, its probe tmp-verify-nudgeDrive.ts copied): a FORWARD
   *  nudge of `nudgeM` metres (default 0.5) begun `nudgeAtS` after the anchor, then rest again. */
  nudgeAtS?: number;
  nudgeM?: number;
  /** Seconds of drive after the strike before the run stops (default 30). */
  tailAfterStrikeS?: number;
  /** Physics steps to keep driving after the session ended (default 0). */
  tailStepsAfterEnd?: number;
  /** Creep window in R after the stop, s (pedals off, R held; default 1.5). */
  creepS?: number;
  /** Render-frame deltas (default 60 Hz). */
  deltas?: readonly number[];
  /** Per graded grid point the session heard: the tick, the step, the traffic. */
  onPoint?: (p: { tick: SimTick; step: LessonStepResult; traffic: TrafficSystem; drive: Readonly<DriveState> }) => void;
  /** Every frame start (also after the session ended): the traffic as it stands. */
  onFrame?: (p: { stepS: number; traffic: TrafficSystem; drive: Readonly<DriveState> }) => void;
}

export interface RingReverseOutcome {
  session: LessonSessionState;
  strikeAtS: number | null;
  restAt: { x: number; y: number; headingDeg: number } | null;
  /** Round 2: when the drive began braking to rest (the strike, or the noStrike halt). */
  anchorS: number | null;
  /** Physics-step time the selector first read R. */
  rAtS: number | null;
  /** How the selector reached R ("assist" when the gesture's shift made it). */
  rBy: ReverseRoute | null;
  reverseStartS: number | null;
  reverseEndS: number | null;
  maxBackKmh: number;
  reversedM: number;
  collisions: Array<{ t: number; points: number; withWhat: string }>;
  enteredAtS: number | null;
}

export function driveRingReverse(o: RingReverseOptions): RingReverseOutcome {
  const reverseAfterS = o.reverseAfterS ?? 5.6;
  const reverseKmh = o.reverseKmh ?? 4.3;
  const reverseM = o.reverseM ?? 6.3;
  const creepS = o.creepS ?? 1.5;
  const tail = o.tailAfterStrikeS ?? 30;

  // CabinControls listens for keys on window; Node has none. A silent stub for
  // the constructor ONLY (no key is ever sent here) — left in place, a global
  // `window` changes how rapier's wasm glue sees its host and its first
  // world.step traps ("unreachable").
  const g = globalThis as unknown as { window?: unknown };
  const hadWindow = g.window !== undefined;
  if (!hadWindow) g.window = { addEventListener() {}, removeEventListener() {} };
  const cabin = new CabinControls({}, "ready");
  if (!hadWindow) delete g.window;
  if (!cabin.seatbeltOn) cabin.toggleSeatbelt();
  const assist = new ReverseAssist();
  const brakeLog = new PedalEdgeLog();
  const throttleLog = new PedalEdgeLog();
  const shifting = { current: false };

  type Phase = "approach" | "wait" | "enter" | "aim" | "settle" | "rest" | "nudge" | "nudgeStop" | "lift" | "press" | "reverse" | "stop" | "creep" | "hold" | "stand";
  let phase: Phase = "approach";
  let pathAt = 1;
  let prevKmh = 0;
  let strikeAtS: number | null = null;
  /** The strike, or (noStrike) the moment the drive began braking on the ring. */
  let anchorS: number | null = null;
  let restAt: RingReverseOutcome["restAt"] = null;
  let rAtS: number | null = null;
  let rBy: ReverseRoute | null = null;
  let reverseStartS: number | null = null;
  let reverseEndS: number | null = null;
  let maxBackKmh = 0;
  let reversedM = 0;
  let phaseSinceS = 0;
  let enteredAtS: number | null = null;
  let circPhi: number | null = null;
  /** The functional brake as the drive's foot holds it (for the gesture's log). */
  let footBrake = false;
  let nudged = false;
  let nudgeFrom: { x: number; y: number } | null = null;

  const setPhase = (p: Phase, t: number) => {
    phase = p;
    phaseSinceS = t;
  };
  const pursue = (st: DriveState, tx: number, ty: number) => {
    let err = ((Math.atan2(tx - st.x, ty - st.y) * 180) / Math.PI - st.headingDeg) % 360;
    if (err > 180) err -= 360;
    else if (err < -180) err += 360;
    return Math.max(-1, Math.min(1, -err / 22));
  };
  const speedTo = (st: DriveState, want: number, steer: number) => {
    const dv = want - st.speedKmh;
    if (want < 0.8 && st.speedKmh < 2) return { throttle: 0, brake: 0.7, steer };
    if (dv >= 0) return { throttle: Math.min(1, dv / 6 + 0.12), brake: 0, steer };
    return { throttle: 0, brake: Math.min(1, -dv / 6), steer };
  };

  /** In R the throttle drives backward (VehicleSim), so «faster back» is throttle. */
  const reverseControl = (st: DriveState, t: number) => {
    if (restAt) reversedM = Math.hypot(st.x - restAt.x, st.y - restAt.y);
    maxBackKmh = Math.max(maxBackKmh, -st.speedKmh);
    if (reversedM >= reverseM) {
      reverseEndS = t;
      setPhase("stop", t);
      return { throttle: 0, brake: 1, steer: 0 };
    }
    const dv = st.speedKmh + reverseKmh; // > 0: too slow backwards
    if (dv > 0) return { throttle: Math.min(1, dv / 3 + 0.15), brake: 0, steer: 0 };
    return { throttle: 0, brake: Math.min(1, -dv / 4), steer: 0 };
  };

  const control = (st: DriveState) => {
    const t = st.step * H;
    const dropped = prevKmh - st.speedKmh > 6;
    prevKmh = st.speedKmh;
    switch (phase) {
      case "approach": {
        const steer = pursue(st, 4.06, st.y + 8);
        if (st.y > -27 && Math.abs(st.speedKmh) < 0.5) setPhase("wait", t);
        return speedTo(st, Math.max(0, Math.min(25, (-25.2 - st.y) * 2.2)), steer);
      }
      case "wait": {
        if (circPhi !== null && t - phaseSinceS > 3 && circPhi >= o.enterAtPhiDeg && circPhi < o.enterAtPhiDeg + 20) {
          setPhase("enter", t);
          enteredAtS = t;
        }
        return { throttle: 0, brake: 0.7, steer: 0 };
      }
      case "enter":
      case "aim": {
        if (dropped && t > (enteredAtS ?? 0) + 1) {
          strikeAtS = t;
          anchorS = t;
          setPhase("settle", t);
          footBrake = true;
          return { throttle: 0, brake: 1, steer: 0 };
        }
        if (phase === "enter") {
          while (pathAt + 1 < ENTER_PATH.length && Math.hypot(ENTER_PATH[pathAt][0] - st.x, ENTER_PATH[pathAt][1] - st.y) < 3.5) pathAt++;
          const [tx, ty] = ENTER_PATH[pathAt];
          if (st.y > -5.5 && st.x > 15) {
            if (o.noStrike) {
              anchorS = t;
              setPhase("settle", t);
              footBrake = true;
              return { throttle: 0, brake: 1, steer: 0 };
            }
            setPhase("aim", t);
          }
          return speedTo(st, 14, pursue(st, tx, ty));
        }
        return speedTo(st, 14, pursue(st, ISLAND_AIM.x, ISLAND_AIM.y));
      }
      case "settle":
        if (Math.abs(st.speedKmh) < 0.05) {
          restAt = { x: st.x, y: st.y, headingDeg: st.headingDeg };
          setPhase(o.standStill ? "stand" : "rest", t);
        }
        return { throttle: 0, brake: 1, steer: 0 };
      case "stand":
        return { throttle: 0, brake: 1, steer: 0 };
      case "nudge": {
        if (Math.hypot(st.x - nudgeFrom!.x, st.y - nudgeFrom!.y) >= (o.nudgeM ?? 0.5)) {
          setPhase("nudgeStop", t);
          return { throttle: 0, brake: 1, steer: 0 };
        }
        return { throttle: st.speedKmh < 2 ? 0.25 : 0, brake: 0, steer: 0 };
      }
      case "nudgeStop":
        if (Math.abs(st.speedKmh) < 0.05) {
          nudged = true;
          restAt = { x: st.x, y: st.y, headingDeg: st.headingDeg };
          setPhase("rest", t);
        }
        return { throttle: 0, brake: 1, steer: 0 };
      case "rest": {
        if (o.nudgeAtS !== undefined && !nudged && anchorS !== null && t >= anchorS + o.nudgeAtS) {
          nudgeFrom = { x: st.x, y: st.y };
          footBrake = false;
          setPhase("nudge", t);
          return { throttle: 0.25, brake: 0, steer: 0 };
        }
        if (anchorS !== null && t >= anchorS + reverseAfterS) {
          if (o.route === "gesture") {
            footBrake = false;
            setPhase("lift", t);
            return { throttle: 0, brake: 0, steer: 0 };
          }
          // selector: the frame start below walks the gate D → N → R with the brake held.
        }
        if (cabin.driveline.selector === "R" && rAtS !== null) {
          footBrake = false;
          reverseStartS = t;
          setPhase("reverse", t);
        }
        return { throttle: 0, brake: 1, steer: 0 };
      }
      case "lift":
        if (t - phaseSinceS >= REVERSE_ASSIST_LIFT_S + 0.1) {
          footBrake = true;
          setPhase("press", t);
          return { throttle: 0, brake: 1, steer: 0 };
        }
        return { throttle: 0, brake: 0, steer: 0 };
      case "press":
        // The same pedal, held: in D it is the brake; once the assist has
        // shifted to R it is the reverse accelerator (LAW 2, assist scope).
        if (cabin.driveline.selector !== "R") {
          if (t - phaseSinceS > REVERSE_ASSIST_HOLD_S + 1) throw new Error("the gesture did not reach R");
          return { throttle: 0, brake: 1, steer: 0 };
        }
        reverseStartS = t;
        setPhase("reverse", t);
        return reverseControl(st, t);
      case "reverse":
        return reverseControl(st, t);
      case "stop":

        if (Math.abs(st.speedKmh) < 0.05) {
          setPhase("creep", t);
        }
        return { throttle: 0, brake: 1, steer: 0 };
      case "creep":
        if (t - phaseSinceS >= creepS) setPhase("hold", t);
        return { throttle: 0, brake: 0, steer: 0 };
      case "hold":
        return { throttle: 0, brake: 1, steer: 0 };
    }
  };

  // (the two hooks are joined per grid point: onStep, then tapPoint, on one tick)
  let pendingStep: { tick: SimTick; step: LessonStepResult } | null = null;
  const onStepHook = (tick: SimTick, step: LessonStepResult) => {
    pendingStep = { tick, step };
  };
  const onTapHook = (tick: SimTick, traffic: TrafficSystem) => {
    if (pendingStep && pendingStep.tick === tick) {
      const drive = { step: Math.round(tick.t / H), x: tick.position.x, y: tick.position.y, headingDeg: tick.headingDeg, speedKmh: tick.speedKmh };
      o.onPoint?.({ tick, step: pendingStep.step, traffic, drive });
    }
    pendingStep = null;
  };

  const startPose = { x: 4.06, y: -93, headingDeg: 0 };
  const deltas = o.deltas ?? [1 / 60];
  let maxSteps = Math.round(240 / H);
  const out = driveIntoContact({
    lesson: o.lesson,
    raw: o.raw,
    start: startPose,
    control: (st) => {
      const r = control(st);
      if (anchorS !== null) maxSteps = Math.min(maxSteps, Math.round((anchorS + tail) / H));
      return r;
    },
    deltas,
    tailSteps: o.tailStepsAfterEnd ?? 0,
    get maxSteps() {
      return maxSteps;
    },
    cabin,
    frameStart: ({ delta, stepS, drive, traffic }) => {
      const circ = traffic.staged("sc-rb-circulating");
      circPhi = circ ? ringPhiDeg(circ.x, circ.y) : null;
      o.onFrame?.({ stepS, traffic, drive });
      // THE SELECTOR — the [ key, one gate step per frame start, brake held.
      if (o.route === "selector" && phase === "rest" && anchorS !== null && stepS >= anchorS + reverseAfterS && cabin.driveline.selector !== "R") {
        cabin.driveline.gearDown();
        if ((cabin.driveline.selector as string) === "R" && rAtS === null) {
          rAtS = stepS;
          rBy = "selector";
        }
      }
      // THE GESTURE — the product's own frame-start assist, on the foot's log.
      const atMs = stepS * 1000;
      brakeLog.push({ down: footBrake, atMs, earliestMs: atMs, stepS });
      if (o.route === "gesture") {
        const cmd = reverseAssistFrameStart({
          assist,
          enabled: true,
          driveLocked: false,
          driveline: cabin.driveline,
          input: {
            brakeTiming: () => ({ log: brakeLog, nowMs: atMs, stepS }),
            throttleTiming: () => ({ log: throttleLog, nowMs: atMs, stepS }),
          },
          speedKmh: drive.speedKmh,
          dtSec: Math.min(Math.max(delta, 0), 0.5),
          shifting,
        });
        if (cmd === "shiftToR" && cabin.driveline.selector === "R" && rAtS === null) {
          rAtS = stepS;
          rBy = "gesture";
        }
      }
    },
    onStep: onStepHook,
    tapPoint: onTapHook,
  });

  return {
    session: out.session,
    strikeAtS,
    anchorS,
    restAt,
    rAtS,
    rBy,
    reverseStartS,
    reverseEndS,
    maxBackKmh,
    reversedM,
    collisions: out.collisions,
    enteredAtS,
  };
}
